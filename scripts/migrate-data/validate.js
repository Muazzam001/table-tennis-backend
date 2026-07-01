import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { createPgClient, resolvePostgresUrl } from '../../utils/pgConnection.js';
import { MIGRATION_TABLES, getExportDir, resolveMysqlConfig } from './config.js';

async function countValidProgressionRowsFromExport(exportDir) {
  const [teamsRaw, matchesRaw, logRaw] = await Promise.all([
    fs.readFile(path.join(exportDir, 'teams.json'), 'utf8'),
    fs.readFile(path.join(exportDir, 'matches.json'), 'utf8'),
    fs.readFile(path.join(exportDir, 'tournament_progression_log.json'), 'utf8'),
  ]);
  const teams = JSON.parse(teamsRaw);
  const matches = JSON.parse(matchesRaw);
  const rows = JSON.parse(logRaw);
  const teamIds = new Set(teams.map((t) => t.id));
  const matchIds = new Set(matches.map((m) => m.id));
  return rows.filter(
    (r) =>
      teamIds.has(r.team_id) &&
      (r.triggered_by_match_id == null || matchIds.has(r.triggered_by_match_id))
  ).length;
}

/**
 * @param {{ exportDir?: string, failuresPath?: string }} [options]
 */
export async function validateMigration(options = {}) {
  const exportDir = path.resolve(process.cwd(), options.exportDir || getExportDir());
  const mysqlConfig = resolveMysqlConfig();
  const databaseUrl = resolvePostgresUrl();

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD');
  }

  const mysqlConn = await mysql.createConnection(mysqlConfig).catch(() => null);
  const pgClient = createPgClient(databaseUrl);
  await pgClient.connect();

  const report = {
    validatedAt: new Date().toISOString(),
    rowCounts: {},
    foreignKeys: [],
    passed: true,
    issues: [],
  };

  try {
    // Row counts: MySQL vs PostgreSQL vs export files
    for (const table of MIGRATION_TABLES) {
      let mysqlCount = null;
      let exportCount = null;
      let pgCount = null;

      if (mysqlConn) {
        const [mysqlExists] = await mysqlConn.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
          [mysqlConfig.database, table]
        );

        if (mysqlExists.length) {
          const [[{ c }]] = await mysqlConn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
          mysqlCount = Number(c);
        }
      }

      try {
        const raw = await fs.readFile(path.join(exportDir, `${table}.json`), 'utf8');
        exportCount = JSON.parse(raw).length;
      } catch {
        exportCount = null;
      }

      const pgResult = await pgClient.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
      pgCount = pgResult.rows[0]?.c ?? 0;

      let expectedCount = mysqlCount ?? exportCount;
      if (table === 'tournament_progression_log') {
        try {
          expectedCount = await countValidProgressionRowsFromExport(exportDir);
        } catch {
          // keep default
        }
      }

      const match = expectedCount === null ? true : pgCount === expectedCount;
      report.rowCounts[table] = {
        mysql: mysqlCount,
        export: exportCount,
        postgres: pgCount,
        expected: expectedCount,
        match,
      };

      if (!match) {
        report.passed = false;
        report.issues.push(
          `Row count mismatch for ${table}: expected=${expectedCount}, PostgreSQL=${pgCount}`
        );
      }
    }

    // Foreign key integrity checks on PostgreSQL
    const fkChecks = [
      {
        name: 'teams.player1_id → players',
        sql: `SELECT COUNT(*)::int AS c FROM teams t
              LEFT JOIN players p ON p.id = t.player1_id WHERE p.id IS NULL`,
      },
      {
        name: 'teams.player2_id → players',
        sql: `SELECT COUNT(*)::int AS c FROM teams t
              LEFT JOIN players p ON p.id = t.player2_id
              WHERE t.player2_id IS NOT NULL AND p.id IS NULL`,
      },
      {
        name: 'matches.team1_id → teams',
        sql: `SELECT COUNT(*)::int AS c FROM matches m
              LEFT JOIN teams t ON t.id = m.team1_id WHERE t.id IS NULL`,
      },
      {
        name: 'matches.team2_id → teams',
        sql: `SELECT COUNT(*)::int AS c FROM matches m
              LEFT JOIN teams t ON t.id = m.team2_id WHERE t.id IS NULL`,
      },
      {
        name: 'matches.winner_team_id → teams',
        sql: `SELECT COUNT(*)::int AS c FROM matches m
              LEFT JOIN teams t ON t.id = m.winner_team_id
              WHERE m.winner_team_id IS NOT NULL AND t.id IS NULL`,
      },
    ];

    for (const check of fkChecks) {
      const result = await pgClient.query(check.sql);
      const orphans = result.rows[0]?.c ?? 0;
      const ok = orphans === 0;
      report.foreignKeys.push({ name: check.name, orphans, ok });
      if (!ok) {
        report.passed = false;
        report.issues.push(`FK violation: ${check.name} (${orphans} orphan rows)`);
      }
    }
  } finally {
    if (mysqlConn) await mysqlConn.end();
    await pgClient.end();
  }

  return report;
}

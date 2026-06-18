// Run database migrations in order
// Usage:
//   npm run migrate
//   npm run migrate -- --status
//   npm run migrate -- --dry-run
//   npm run migrate -- --help

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../database/migrations');
const MIGRATION_FILE_PATTERN = /^\d{3}_.+\.sql$/;

const printHelp = () => {
  console.log(`
Run database migrations for the Table Tennis Tournament app.

Migrations are read from backend/database/migrations/ (numbered files only, e.g. 001_*.sql).
Applied migrations are recorded in the schema_migrations table.

Usage:
  npm run migrate
  npm run migrate -- [options]

Options:
  --status     Show applied and pending migrations (no changes)
  --dry-run    List pending migrations without applying them
  -h, --help   Show this help message

Examples:
  npm run migrate
  npm run migrate -- --status
  npm run migrate -- --dry-run
`);
};

const hasFlag = (flag) => process.argv.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp();
  process.exit(0);
}

function readDbConfig() {
  const dbName = process.env.DB_NAME;
  const dbHost = process.env.DB_HOST;
  const dbUser = process.env.DB_USER;
  const dbPass = process.env.DB_PASS;

  const missing = [];
  if (!dbHost) missing.push('DB_HOST');
  if (!dbUser) missing.push('DB_USER');
  if (dbPass === undefined || dbPass === null) missing.push('DB_PASS');
  if (!dbName) missing.push('DB_NAME');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const dbPortStr = process.env.DB_PORT;
  let dbPort = 3306;
  if (dbPortStr) {
    const parsed = parseInt(dbPortStr, 10);
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error(`Invalid DB_PORT value: "${dbPortStr}"`);
    }
    dbPort = parsed;
  }

  return {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass || '',
    database: dbName,
    multipleStatements: true,
  };
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((file) => MIGRATION_FILE_PATTERN.test(file)).sort();
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function prepareSql(sql, dbName) {
  return sql
    .replace(/^USE\s+[^;]+;\s*/gim, '')
    .replace(/`table_tennis_tournament`/g, `\`${dbName}\``)
    .trim();
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      version VARCHAR(10) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_applied_at (applied_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
  );
  return rows;
}

async function loadMigrationPlan(connection) {
  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations(connection);
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

  const plan = files.map((file) => {
    const version = file.slice(0, 3);
    const appliedRow = appliedByVersion.get(version);
    return {
      file,
      version,
      applied: Boolean(appliedRow),
      appliedAt: appliedRow?.applied_at ?? null,
      recordedChecksum: appliedRow?.checksum ?? null,
    };
  });

  return { plan, files };
}

async function readMigration(file) {
  const fullPath = path.join(MIGRATIONS_DIR, file);
  const raw = await fs.readFile(fullPath, 'utf8');
  return {
    raw,
    hash: checksum(raw),
    sql: prepareSql(raw, process.env.DB_NAME),
  };
}

async function applyMigration(connection, file) {
  const version = file.slice(0, 3);
  const { raw, hash, sql } = await readMigration(file);

  if (!sql) {
    throw new Error(`Migration ${file} is empty after preprocessing`);
  }

  await connection.beginTransaction();
  try {
    await connection.query(sql);
    await connection.execute(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
      [version, file, hash]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function printStatus(plan) {
  console.log('\nMigration status:\n');
  for (const item of plan) {
    const status = item.applied ? `applied ${item.appliedAt}` : 'pending';
    console.log(`  ${item.version}  ${item.file}  [${status}]`);
  }
  console.log('');
}

async function run() {
  const dryRun = hasFlag('--dry-run');
  const statusOnly = hasFlag('--status');
  let connection;

  try {
    const config = readDbConfig();
    connection = await mysql.createConnection(config);

    console.log(`\n📦 Database: ${config.database} @ ${config.host}:${config.port}`);

    await ensureMigrationsTable(connection);
    const { plan } = await loadMigrationPlan(connection);

    for (const item of plan) {
      if (!item.applied || !item.recordedChecksum) continue;
      const { hash } = await readMigration(item.file);
      if (hash !== item.recordedChecksum) {
        console.warn(
          `⚠️  Checksum changed for ${item.file} (already applied). Re-run manually if needed.`
        );
      }
    }

    if (statusOnly || dryRun) {
      printStatus(plan);
      const pending = plan.filter((item) => !item.applied);
      if (dryRun) {
        if (pending.length === 0) {
          console.log('No pending migrations.');
        } else {
          console.log(`Pending migrations (${pending.length}):`);
          for (const item of pending) {
            console.log(`  - ${item.file}`);
          }
          console.log('');
        }
      }
      process.exit(0);
    }

    const pending = plan.filter((item) => !item.applied);
    if (pending.length === 0) {
      console.log('✅ Database is up to date. No pending migrations.');
      process.exit(0);
    }

    console.log(`\n🚀 Applying ${pending.length} migration(s)...\n`);

    for (const item of pending) {
      process.stdout.write(`  → ${item.file} ... `);
      await applyMigration(connection, item.file);
      console.log('done');
    }

    console.log('\n✅ All pending migrations applied successfully.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();

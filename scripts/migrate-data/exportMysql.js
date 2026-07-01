import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { MIGRATION_TABLES, getExportDir, resolveMysqlConfig } from './config.js';
import { transformRows } from './transform.js';

/**
 * @param {{ outputDir?: string }} [options]
 */
export async function exportMysqlData(options = {}) {
  const outputDir = path.resolve(process.cwd(), options.outputDir || getExportDir());
  const mysqlConfig = resolveMysqlConfig();

  await fs.mkdir(outputDir, { recursive: true });

  const connection = await mysql.createConnection(mysqlConfig);
  const manifest = {
    exportedAt: new Date().toISOString(),
    source: {
      host: mysqlConfig.host,
      database: mysqlConfig.database,
    },
    tables: {},
  };

  try {
    for (const table of MIGRATION_TABLES) {
      const [exists] = await connection.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = ? AND table_name = ?`,
        [mysqlConfig.database, table]
      );

      if (!exists.length) {
        console.log(`  skip  ${table} (not in MySQL)`);
        manifest.tables[table] = { rowCount: 0, skipped: true };
        continue;
      }

      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      const transformed = transformRows(table, rows);
      const filePath = path.join(outputDir, `${table}.json`);
      await fs.writeFile(filePath, JSON.stringify(transformed, null, 2), 'utf8');

      manifest.tables[table] = { rowCount: transformed.length, file: `${table}.json` };
      console.log(`  export ${table}: ${transformed.length} rows`);
    }
  } finally {
    await connection.end();
  }

  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { outputDir, manifest };
}

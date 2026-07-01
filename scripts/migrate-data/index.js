#!/usr/bin/env node
/**
 * MySQL → Supabase data migration orchestrator
 *
 * Usage:
 *   npm run db:migrate-data
 *   npm run db:migrate-data -- --export-only
 *   npm run db:migrate-data -- --import-only
 *   npm run db:migrate-data -- --validate-only
 *   npm run db:migrate-data -- --retry-failures migration-export/failures.json
 *   npm run db:migrate-data -- --help
 */

import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { exportMysqlData } from './exportMysql.js';
import { importPostgresData, retryFailedImports } from './importPostgres.js';
import { validateMigration } from './validate.js';
import { getExportDir } from './config.js';

const printHelp = () => {
  console.log(`
MySQL → Supabase data migration

Prerequisites:
  - MySQL source: DB_HOST, DB_USER, DB_PASS, DB_NAME (existing .env)
  - Supabase target: DATABASE_URL or SUPABASE_DB_PASSWORD
  - Schema applied: npm run db:migrate

Usage:
  npm run db:migrate-data [options]

Options:
  --export-only       Export MySQL tables to JSON only
  --import-only       Import from migration-export/ to Supabase
  --validate-only     Compare row counts and FK integrity
  --no-truncate       Import without truncating target tables first
  --retry-failures <file>  Retry rows from failures JSON
  -h, --help          Show this help

Environment:
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.zhbyslleexcktjpcdjxq.supabase.co:5432/postgres
  SUPABASE_DB_PASSWORD=...   (alternative to DATABASE_URL)
  MIGRATION_EXPORT_DIR=migration-export
`);
};

const hasFlag = (f) => process.argv.includes(f);
const getArg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp();
  process.exit(0);
}

async function saveFailures(failed) {
  if (!failed?.length) return null;
  const dir = path.resolve(process.cwd(), getExportDir());
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'failures.json');
  await fs.writeFile(filePath, JSON.stringify(failed, null, 2), 'utf8');
  return filePath;
}

async function main() {
  const exportOnly = hasFlag('--export-only');
  const importOnly = hasFlag('--import-only');
  const validateOnly = hasFlag('--validate-only');
  const noTruncate = hasFlag('--no-truncate');
  const retryFile = getArg('--retry-failures');
  const tablesArg = getArg('--tables');
  const tablesFilter = tablesArg ? tablesArg.split(',').map((t) => t.trim()) : null;

  if (retryFile) {
    console.log('\n🔄 Retrying failed imports...');
    const { succeeded, stillFailed } = await retryFailedImports({ failuresPath: retryFile });
    console.log(`   Succeeded: ${succeeded}, Still failed: ${stillFailed.length}`);
    if (stillFailed.length) {
      const path = await saveFailures(stillFailed);
      console.log(`   Remaining failures: ${path}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (validateOnly) {
    console.log('\n✅ Validating migration...');
    const report = await validateMigration();
    console.log('\nRow counts:');
    for (const [table, counts] of Object.entries(report.rowCounts)) {
      const status = counts.match ? '✓' : '✗';
      console.log(
        `  ${status} ${table}: MySQL=${counts.mysql ?? 'n/a'} PG=${counts.postgres} export=${counts.export ?? 'n/a'}`
      );
    }
    console.log('\nForeign keys:');
    for (const fk of report.foreignKeys) {
      console.log(`  ${fk.ok ? '✓' : '✗'} ${fk.name} (orphans: ${fk.orphans})`);
    }
    if (!report.passed) {
      console.error('\n❌ Validation FAILED');
      report.issues.forEach((i) => console.error(`   - ${i}`));
      process.exit(1);
    }
    console.log('\n✓ Validation passed');
    return;
  }

  if (!importOnly) {
    console.log('\n📤 Exporting MySQL data...');
    const { outputDir, manifest } = await exportMysqlData();
    console.log(`   Export directory: ${outputDir}`);
    const total = Object.values(manifest.tables).reduce((s, t) => s + (t.rowCount || 0), 0);
    console.log(`   Total rows exported: ${total}`);
  }

  if (!exportOnly) {
    console.log('\n📥 Importing to Supabase PostgreSQL...');
    const results = await importPostgresData({
      truncate: !noTruncate,
      tables: tablesFilter ?? undefined,
    });
    const failItems = [...(results.failed || []), ...(results.skipped || [])];
    const failPath = failItems.length ? await saveFailures(failItems) : null;
    if (failPath) {
      console.log(`\n⚠️  ${failItems.length} skipped/failed row(s) — see ${failPath}`);
      console.log(`   Retry: npm run db:migrate-data -- --retry-failures ${failPath}`);
    }

    console.log('\n✅ Validating...');
    const report = await validateMigration();
    if (!report.passed) {
      report.issues.forEach((i) => console.error(`   - ${i}`));
      process.exit(1);
    }
    console.log('✓ Data migration complete and validated');
  }
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});

import 'dotenv/config';
import pool from '../utils/database.js';
import {
  ensureDivisionSchema,
  auditDivisionSchema,
} from '../services/divisionSchemaMigrationService.js';

const before = await auditDivisionSchema(pool);
if (before.ok) {
  console.log('✅ Database already uses division columns everywhere.');
  process.exit(0);
}

console.log('Legacy league schema detected:');
for (const item of before.legacyColumns) {
  console.log(`  - ${item.table}${item.column === '(table)' ? '' : `.${item.column}`}`);
}

const result = await ensureDivisionSchema(pool);
if (result.changes.length > 0) {
  console.log('\nApplied upgrades:');
  for (const change of result.changes) {
    console.log(`  ✓ ${change}`);
  }
} else {
  console.log('\nNo automatic upgrades were applied.');
}

const after = await auditDivisionSchema(pool);
if (after.ok) {
  console.log('\n✅ Division schema upgrade complete.');
  process.exit(0);
}

console.error('\n❌ Some legacy league identifiers remain:');
for (const item of after.legacyColumns) {
  console.error(`  - ${item.table}${item.column === '(table)' ? '' : `.${item.column}`}`);
}
process.exit(1);

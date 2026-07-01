/**
 * Shared config and table metadata for MySQL → Supabase data migration.
 */

/** Import order respects foreign keys */
export const MIGRATION_TABLES = [
  'players',
  'division_settings',
  'users',
  'teams',
  'matches',
  'statistics',
  'team_pairing_rules',
  'tournament_progression_log',
  'tournament_archives',
  'schema_migrations',
];

/** Tables with SERIAL id — reset sequences after import */
export const SERIAL_ID_TABLES = [
  'players',
  'users',
  'teams',
  'matches',
  'statistics',
  'team_pairing_rules',
  'tournament_progression_log',
  'tournament_archives',
  'schema_migrations',
];

export const JSON_COLUMNS = {
  division_settings: ['format_config'],
  matches: ['set_game_scores'],
  tournament_archives: ['snapshot_json'],
};

export const BOOLEAN_COLUMNS = {
  players: ['is_active'],
  matches: ['is_abandoned'],
  users: ['is_active'],
};

export function resolveMysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASS ?? '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'table_tennis_tournament',
  };
}

export { resolvePostgresUrl, buildPoolerUrl } from '../../utils/pgConnection.js';

export function getExportDir() {
  return process.env.MIGRATION_EXPORT_DIR || 'migration-export';
}

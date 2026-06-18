# Database Migrations

## New installations

Use the full schema (no migrations needed):

```bash
cd backend
mysql -u root -p < database/schema.sql
```

## Upgrading an existing database

### Using the backend script (recommended)

From the `backend` folder (uses `backend/.env`):

```bash
cd backend
npm run migrate              # apply pending migrations
npm run migrate -- --status  # show applied vs pending
npm run migrate -- --dry-run # list pending without applying
```

Applied migrations are tracked in the `schema_migrations` table.

### Manual SQL (alternative)

Run migrations **in order**:

| # | File | Purpose |
|---|------|---------|
| 001 | `001_add_round_type_and_pool.sql` | `round_type`, `pool`, abandonment fields |
| 002 | `002_add_category_and_league.sql` | `players.category`, `teams.league`, `matches.league` |
| 003 | `003_add_third_place_and_extend_round_type.sql` | `Third Place` round type |
| 004 | `004_pool_varchar.sql` | `pool` VARCHAR(5) for groups A–Z |
| 005 | `005_unique_match_constraint.sql` | Unique match per teams/round/pool |
| 008 | `008_optional_player_email.sql` | Allow `players.email` to be NULL |
| 009 | `009_tournament_archives.sql` | Tournament archive snapshots |
| 010 | `010_league_settings_and_singles.sql` | Per-league singles/doubles format |
| 011 | `011_team_pairing_rules.sql` | Doubles pairing rules (must / never / prefer) |

```bash
mysql -u root -p table_tennis_tournament < database/migrations/001_add_round_type_and_pool.sql
mysql -u root -p table_tennis_tournament < database/migrations/002_add_category_and_league.sql
mysql -u root -p table_tennis_tournament < database/migrations/003_add_third_place_and_extend_round_type.sql
mysql -u root -p table_tennis_tournament < database/migrations/004_pool_varchar.sql
mysql -u root -p table_tennis_tournament < database/migrations/005_unique_match_constraint.sql
mysql -u root -p table_tennis_tournament < database/migrations/008_optional_player_email.sql
```

## Automatic migrations

The backend `seedController` (`POST /api/seed/players`) applies the same column migrations automatically when seeding or when tables are missing columns.

## Deprecated files

- `add_round_type.sql` → use `001_*`
- `add_groups_and_third_place.sql` → use `003_*` + `004_*`
- `pool_varchar.sql` → use `004_*`

# Database

MySQL schema and scripts for the Table Tennis Tournament app.

## Files

| File | Purpose |
|------|---------|
| `schema.sql` | **New installs** — creates DB + all tables (latest schema) |
| `seed.sql` | Sample players (28 Expert men); teams/matches via app |
| `reset.sql` | Truncate tournament data; **preserves `users`** |
| `reset_full.sql` | Drop all tables including `users` |
| `migrations/` | Ordered upgrades for existing databases |

## Quick setup

From the `backend` folder:

```bash
cd backend
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql    # optional
```

From the project root:

```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/seed.sql    # optional
```

Or use the app: log in as admin → Home → **Seed Demo Players** (auto-creates schema if missing).

## Schema summary

### `players`
- `expertise_level`: Intermediate, Expert
- `category`: Men, Women
- `is_active`: soft delete

### `teams`
- `division`: Expert, Intermediate, Women
- Two players per team (division rules enforced in app)

### `matches`
- `round_type`: Qualifying, Quarter Final, Semi Final, Final, **Third Place**
- `pool`: **VARCHAR(5)** — group A–Z (NULL for knockout)
- `division`: Expert, Intermediate, Women
- `is_abandoned`, `abandoned_reason`
- Unique: `(team1_id, team2_id, round_type, pool)`

### `statistics`
- Reserved; live standings computed from `matches`

### `users`
- JWT auth; preserved by `reset.sql`

## Reset options

### Application reset (recommended)

Clears players, teams, matches, statistics. **Keeps admin accounts.**

```bash
mysql -u root -p < database/reset.sql
```

Or in the app: Home → **Reset Application Data (Keep Users)**  
Or API: `POST /api/admin/reset` (admin JWT required)

### Full reset

```bash
mysql -u root -p < database/reset_full.sql
mysql -u root -p < database/schema.sql
cd backend && npm run create-admin
```

## Migrations

New installations: use `schema.sql` only.

Existing databases: run `migrations/001` through `005` in order.  
Details: [migrations/README.md](./migrations/README.md)

The backend seed controller also applies missing columns automatically.

## Seeding

`seed.sql` inserts 28 Expert (Men) players. For a full demo:

1. Run `seed.sql` (or use in-app **Seed Demo Players** / `POST /api/seed/players`)
2. Edit players on the **Players** page (optional)
3. Generate and save teams per division on the **Teams** page (even player counts per division)
4. Generate group-stage and knockout schedules on the **Matches** page
5. View standings and results on the **Tournament** page

## Verification

```sql
USE table_tennis_tournament;
SHOW TABLES;
DESCRIBE matches;
SELECT COUNT(*) FROM players;
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Table doesn't exist | Run `schema.sql` |
| Column missing | Run migrations or seed endpoint (auto-migrate) |
| Duplicate entry on seed | `seed.sql` uses `ON DUPLICATE KEY UPDATE` |
| FK errors on reset | Use `reset.sql` (disables FK checks) |

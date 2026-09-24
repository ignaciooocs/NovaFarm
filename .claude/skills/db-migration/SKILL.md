---
description: Generate and wire a Drizzle SQLite migration for ui-app's on-device database after editing db/schema.ts, checking it against data already sitting unsynced on field devices. Use whenever ui-app/db/schema.ts changes.
---

# ui-app local DB migration

`ui-app` holds the harvest data in on-device SQLite (`anotaya.db`) until the user hits "Sincronizar Jornada". Migrations run at app startup through `useMigrations(db, migrations)` in `ui-app/app/_layout.tsx`, against a database that **may contain a workday nobody has synced yet**. That's the constraint that makes this different from a server migration: a bad migration here destroys field data that exists nowhere else.

## 1. Review the schema change first

```
git --no-pager diff ui-app/db/schema.ts
```

Classify it before generating anything:

- **Additive** (new table, new nullable column, new index) — safe.
- **New NOT NULL column on an existing table** — needs a default, or the migration fails on devices with existing rows.
- **Rename or drop** — SQLite handles these by rebuilding the table; drizzle-kit will ask interactively whether it's a rename or a drop+create. Getting that answer wrong silently drops the column's data on every device. If the change is ambiguous, ask the user rather than guessing.
- **Type change on a column that's already synced** — check `ui-app/lib/catalogSync.ts`, `harvesterSync.ts` and `ui-app/app/(app)/sync.tsx` for code that reads it, and the server DTO it maps to.

## 2. Generate

Run `pnpm db:generate` in `ui-app/`. It writes four things — all four must appear in `git status`:

```
drizzle/NNNN_<name>.sql          # the new migration
drizzle/meta/NNNN_snapshot.json  # the new snapshot
drizzle/meta/_journal.json       # updated with the new entry
drizzle/migrations.js            # updated: imports mNNNN and adds it to the map
```

If `migrations.js` didn't pick up the new file, the migration exists on disk but **never runs on device** — that's the failure mode to check for, not the SQL itself.

## 3. Read the generated SQL

Open the new `.sql` and confirm it does what the schema change intended. Two rules:

- **Never edit a migration that's already shipped** (anything present on a device that has run it). Fix forward with a new one — the journal keys off the file, and rewriting history breaks devices mid-upgrade.
- Editing the *just-generated, not-yet-shipped* migration is fine, but prefer changing `db/schema.ts` and regenerating so schema and SQL stay in sync.

## 4. Check the code that touches the changed tables

`ui-app/db/queries.ts` is where the app's reads/writes live. A column rename that compiles is not a passing grade: the offline write path (the "Anotar" hot path) must stay a pure local-SQLite write with no network I/O and no added latency.

Run `pnpm exec tsc --noEmit` in `ui-app/`.

## 5. Report

Tell the user: what the migration does, whether it's destructive for unsynced data, and whether a device mid-workday can take it safely. If it *is* destructive, say plainly that field data can be lost and let them decide — don't quietly pick the safe-looking option.

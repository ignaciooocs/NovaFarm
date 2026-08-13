# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

The tech stack has been chosen and both apps are scaffolded (initial boilerplate only, no domain features implemented yet). Full requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (written in Spanish; domain terminology below is intentionally kept in Spanish since it reflects real field/user-facing vocabulary and is used directly in code/UI copy). The Mongo-based domain model below supersedes the SQL DDL in that document — REQUIREMENTS.md still describes the original relational proposal and hasn't been updated yet.

There is no git repository initialized yet.

## Project Overview

AnotaYa (also referred to as AnotaCampo / AnotaAgro) digitizes manual fruit-harvest tracking currently done on paper in the field. It replaces pen-and-paper tally marks with a fast mobile interface for recording harvest deliveries per worker, while working fully offline in areas without network coverage.

## Architecture

Two independent apps, no shared workspace/monorepo tooling between them:

- **`ui-app/`** — React Native + Expo (TypeScript) field client. Offline-first: all capture happens locally in SQLite (`expo-sqlite`); syncing to the server is a separate, explicit, user-triggered action ("Sincronizar Jornada"), never automatic.
- **`server-app/`** — NestJS (TypeScript) backend. Receives synced data, persists to MongoDB Atlas via Mongoose (`@nestjs/mongoose`), validates payloads with DTOs (`class-validator`/`class-transformer`).

Both apps use **pnpm** (pinned via `packageManager` in each `package.json`, currently `pnpm@10.17.0`), not npm — no `package-lock.json`, use `pnpm-lock.yaml`.

### Commands

**server-app** (NestJS):
```
pnpm start:dev   # dev server with watch mode
pnpm build        # nest build
pnpm lint          # eslint --fix
pnpm test           # jest unit tests
pnpm test:e2e        # jest e2e tests (test/*.e2e-spec.ts)
pnpm test -- <path>   # run a single test file
```

**ui-app** (Expo):
```
pnpm start   # expo start — scan QR with Expo Go, or press a/i/w
pnpm android
pnpm ios
pnpm web
```
`ui-app/.npmrc` sets `node-linker=hoisted` — required for Metro's module resolution to work correctly with pnpm's non-flat `node_modules` layout; don't remove it without testing the Metro bundler still resolves everything.

`ui-app/AGENTS.md` (referenced from `ui-app/CLAUDE.md`) flags that Expo APIs have changed recently — check the versioned docs at the SDK version in `ui-app/package.json` (`expo` dependency) before writing Expo-specific code.

### Data model (MongoDB collections, server-app)

Translated from the original relational DDL in REQUIREMENTS.md §4 — same business meaning, but referential integrity (`frutaId`, `cosechadorId`, `unidadMedidaId` references) is enforced at the application layer, not by the database. Full diagram and rationale: [docs/diagrams/modelo-datos.md](docs/diagrams/modelo-datos.md).

- `cosechadores` — `{ _id, nombre, apellido, apodo?, rutId?, activo }` — global, persistent worker catalog. `nombre`+`apellido` is **not** a uniqueness key — two different people can share a name; identity is `_id`. `rutId` is optional/nullable (not collected at quick field registration, filled in later by an admin). `apodo` is optional and exists to help disambiguate repeated names.
- `frutas` — `{ _id, nombre, activa }` — fully configurable catalog, never hardcoded
- `unidadesMedida` — `{ _id, nombre, factorKilos, activa }` — conversion factor to kilos (e.g., Tarro 10kg → 10.000); a unit can also represent direct-weighing mode where the entered value is already kilos
- `jornadas` — `{ _id, fecha, frutaId, unidadMedidaDefectoId, estado: 'ABIERTA'|'CERRADA', createdAt }` — closing a jornada (RF-01.2) should compute and freeze aggregate totals into the document itself rather than recomputing via aggregation on every read
- `cosechadorJornada` — `{ _id, jornadaId, cosechadorId, numeroJornada, agregadoEn, sincronizadoOffline }` — the day's roster (which cosechadores are working that jornada), decoupled from `cosechasDetalle` so someone shows up in the "anotador" list before their first delivery. `numeroJornada` is a per-jornada correlative (1, 2, 3...) assigned locally on-device (not a server-issued global sequence) so it works fully offline — unique per `jornadaId`, never a global worker ID.
- `cosechasDetalle` — `{ _id, jornadaId, cosechadorId, unidadMedidaId, cantidadUnidades, kilosTotales, horaRegistro, sincronizadoOffline }` — references `cosechadorId`+`jornadaId` directly (not via `cosechadorJornada._id`) to avoid an extra lookup in the local write hot path

### Key behavioral constraints that should drive design decisions

- **Offline-first is non-negotiable**: all writes during a jornada happen locally first in `ui-app`'s SQLite store; server sync is a distinct, explicit action.
- **Sub-100ms tap-to-record latency**: the "anotar" (record) interaction in `ui-app` must never block on network I/O — it only touches local SQLite.
- **Everything configurable at runtime**: fruits, units of measure, and their kg conversion factors are data-driven (Mongo documents), never hardcoded — adding a new fruit or container type must not require code changes in `server-app`.
- **Dual recording modes**: "conteo de envases" (count containers, converted via `factorKilos`) vs. "pesaje directo" (direct weight entry from a scale) — the same jornada/UI should support switching modes.
- **Field UX** (`ui-app`): large touch targets usable one-handed and in direct sunlight, high-contrast display, terminology matching field workers' actual vocabulary (Anotar, Tarro, Vuelta) rather than generic technical terms.

### Deployment target (not yet configured)

`server-app` is intended for a managed PaaS (Railway or Render) with MongoDB Atlas as the database — no infra/CI is set up yet, and no Atlas cluster or connection string has been wired into the app.

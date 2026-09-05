# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Detailed, app-specific conventions live in [.claude/rules/](.claude/rules/) and load automatically when a file in that app enters context:

| Rule | Loads when touching | Covers |
| --- | --- | --- |
| [.claude/rules/server-app.md](.claude/rules/server-app.md) | `server-app/**` | status, commands + Docker, data model, API layer, DTO structure, auth/tenant guards, deployment |
| [.claude/rules/ui-app.md](.claude/rules/ui-app.md) | `ui-app/**` | status, commands + Metro/orval caveats, Expo-versioned-docs warning, field UX and copy |

Project skills in [.claude/skills/](.claude/skills/), invocable with `/`:

| Skill | What it does |
| --- | --- |
| `/new-module <entity>` | Scaffolds a tenant-scoped `server-app` module (schema → DTOs → service → controller → spec) from the `fruits/` reference |
| `/sync-api` | Regenerates `ui-app`'s orval client from the running server's OpenAPI spec and fixes what the new contract breaks |
| `/db-migration` | Generates and wires a Drizzle SQLite migration for `ui-app`, checked against unsynced on-device data |
| `/tenant-audit [diff-args]` | Audits `server-app` changes for missing `farmId` scoping and other cross-tenant leaks |

## Project Status

The tech stack has been chosen and both apps are underway.

- **`server-app`** has the full harvest-tracking vertical slice implemented end-to-end (farms, Firebase auth, catalogs, users/team, workdays, offline-sync endpoints), plus `/health` and rate limiting on auth. Known gaps: CI, e2e coverage beyond the scaffold test, and PaaS deployment.
- **`ui-app`** has the full core loop working end-to-end and verified on a physical device via Expo Go: auth → onboarding → catalogs → open workday → roster → Anotador → sync → close. Runs on Expo SDK 57, no placeholders left in `(app)/`.

Full requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (written in Spanish). The Mongo-based domain model in [.claude/rules/server-app.md](.claude/rules/server-app.md) supersedes the SQL DDL in that document — REQUIREMENTS.md still describes the original relational proposal and hasn't been updated yet. [docs/diagrams/arquitectura.md](docs/diagrams/arquitectura.md) records architectural decisions beyond REQUIREMENTS.md — module boundaries, API versioning, offline-sync/idempotency design, deployment posture — treat it as decided direction, not current state; several of its decisions aren't implemented yet. [docs/diagrams/ui-arquitectura.md](docs/diagrams/ui-arquitectura.md) records the equivalent decisions for `ui-app` (UI library, theming, local persistence, navigation), including its "Estado actual y próximos pasos" section.

**Naming convention**: entity/collection names, field names, enum values, function/variable names — everything at the code level — is in English. This is a deliberate split from `ui-app`'s field-facing copy, which stays in Spanish (RNF-02: the terminology field workers actually use — "Anotar", "Tarro", "Vuelta" — not generic technical terms). Code in English, UI copy localized to the end user; don't let one leak into the other (e.g. don't name a collection `cosechadores`, and don't hardcode an English button label a Chilean field worker would read).

## Project Overview

NovaFarm (formerly AnotaYa, also referred to during earlier planning as AnotaCampo / AnotaAgro) digitizes manual fruit-harvest tracking currently done on paper in the field. It replaces pen-and-paper tally marks with a fast mobile interface for recording harvest deliveries per worker, while working fully offline in areas without network coverage.

## Architecture

Two independent apps, no shared workspace/monorepo tooling between them:

- **`ui-app/`** — React Native + Expo (TypeScript) field client. Offline-first: all capture happens locally in SQLite (`expo-sqlite`); syncing to the server is a separate, explicit, user-triggered action ("Sincronizar Jornada"), never automatic.
- **`server-app/`** — NestJS (TypeScript) backend, a modular monolith. Receives synced data, persists to MongoDB Atlas via Mongoose (`@nestjs/mongoose`), validates payloads with DTOs (`class-validator`/`class-transformer`).

Both apps use **pnpm** (pinned via `packageManager` in each `package.json`, currently `pnpm@10.17.0`), not npm — no `package-lock.json`, use `pnpm-lock.yaml`.

### Commands (quick reference — caveats live in the per-app rules)

```
server-app:  pnpm start:dev | pnpm build | pnpm lint | pnpm test | pnpm test:e2e | pnpm test -- <path>
ui-app:      pnpm start | pnpm android | pnpm ios | pnpm web | pnpm db:generate | pnpm generate:api
```

`server-app` won't finish booting without a reachable MongoDB (`MONGODB_URI_ATLAS` in `server-app/.env`, or `docker compose up` in `server-app/`). `pnpm generate:api` in `ui-app` needs `server-app` running locally.

## Key behavioral constraints that should drive design decisions

- **Offline-first is non-negotiable**: all writes during a workday happen locally first in `ui-app`'s SQLite store; server sync is a distinct, explicit action.
- **Sub-100ms tap-to-record latency**: the "Anotar" (record) interaction in `ui-app` must never block on network I/O — it only touches local SQLite.
- **Everything configurable at runtime**: fruits, units of measure, and their kg conversion factors are data-driven (Mongo documents), never hardcoded — adding a new fruit or container type must not require code changes in `server-app`.
- **Dual recording modes**: container-counting (converted via `kgFactor`) vs. direct-weighing (weight entered straight from a scale) — the same workday/UI should support switching modes.
- **Field UX** (`ui-app`): large touch targets usable one-handed and in direct sunlight, high-contrast display, terminology matching field workers' actual Spanish vocabulary.
- **Multi-tenant isolation is non-negotiable**: every collection carries `farmId`, and every `server-app` query must filter by it directly — never rely on a transitive join (e.g. through `recorderId`) to scope by tenant, since nullable fields like `workdays.recorderId` (guest mode) break that path. A forgotten `farmId` filter is a cross-tenant data leak, not just a bug. Identity is delegated to **Firebase Authentication**; the guard/decorator mechanism that enforces this is documented in [.claude/rules/server-app.md](.claude/rules/server-app.md).

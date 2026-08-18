# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

The tech stack has been chosen and both apps are scaffolded (initial boilerplate only, no domain features implemented yet). Full requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (written in Spanish). The Mongo-based domain model below supersedes the SQL DDL in that document — REQUIREMENTS.md still describes the original relational proposal and hasn't been updated yet.

**Naming convention**: entity/collection names, field names, enum values, function/variable names — everything at the code level — is in English. This is a deliberate split from `ui-app`'s field-facing copy, which stays in Spanish (RNF-02: the terminology field workers actually use — "Anotar", "Tarro", "Vuelta" — not generic technical terms). Code in English, UI copy localized to the end user; don't let one leak into the other (e.g. don't name a collection `cosechadores`, and don't hardcode an English button label a Chilean field worker would read).

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

Adapted from the original relational DDL in REQUIREMENTS.md §4 — same business meaning, but referential integrity (`fruitId`, `harvesterId`, `measurementUnitId` references) is enforced at the application layer, not by the database. Entity/field names are English per the naming convention above (REQUIREMENTS.md still uses the original Spanish names — not yet updated). Full diagram and rationale: [docs/diagrams/modelo-datos.md](docs/diagrams/modelo-datos.md).

- `farms` — `{ _id, name, type: 'organization'|'independent', invitationCode, active, createdAt }` — the tenant. Every other collection carries a `farmId` and belongs to exactly one farm; no cross-farm data access. No `adminId` field — a farm's admin(s) are derived via `users` where `farmId` matches and `role: 'admin'`. `invitationCode` is what a `recorder` enters during onboarding to join; regenerable by an admin (no expiry yet). `type` is UI-only (whether to show the "invite your team" step after creation), no backend logic differs.
- `users` — `{ _id, farmId, name, email, passwordHash, nationalId?, role: 'recorder'|'admin', active }` — authenticated users of `ui-app`. `farmId` is **required, never null** — "working independently" auto-creates a 1-member farm rather than leaving a user tenant-less (this is a different concern than `workdays.recorderId` being nullable: that's about attribution, this is about data isolation — a null farmId risks two users seeing each other's data). Login requires connectivity once; the session/token is then persisted locally on-device and only re-checked at sync time — local capture (RNF-01) never depends on it. Onboarding order: ask role first (recorder/admin), then affiliation — admin creates a farm (labeled either "for my team" or "independent", same backend action, differs only in `type` and post-creation UI); recorder joins an existing farm via `invitationCode`. There is no "independent recorder" path — working alone still requires admin-level catalog control.
- `harvesters` — `{ _id, farmId, firstName, lastName, nickname?, nationalId?, active }` — persistent worker catalog, **scoped per farm** (not global — a farm's roster, including PII like `nationalId`, must not be visible to another farm). `firstName`+`lastName` is **not** a uniqueness key — two different people can share a name; identity is `_id`. `nationalId` is optional/nullable (not collected at quick field registration, filled in later by an admin). `nickname` is optional and exists to help disambiguate repeated names.
- `fruits` — `{ _id, farmId, name, active }` — fully configurable catalog, never hardcoded, **scoped per farm** (unique index is compound `{ farmId, name }`, not global — two farms can each have their own "Lemon")
- `measurementUnits` — `{ _id, farmId, name, kgFactor, active }` — conversion factor to kilos (e.g., 10kg crate → 10.000); a unit can also represent direct-weighing mode where the entered value is already kilos. Scoped per farm, same reasoning as `fruits`.
- `workdays` — `{ _id, farmId, date, fruitId, defaultMeasurementUnitId, status: 'OPEN'|'CLOSED', createdAt, finalTotalKg, recorderId? }` — closing a workday (RF-01.2) should compute and freeze aggregate totals into the document itself rather than recomputing via aggregation on every read. `recorderId` is optional (nullable = guest-mode workday) — but `farmId` is **never** null even then; it's set from the device/session's active farm at workday-creation time, independent of `recorderId`. Don't derive `farmId` transitively via `recorderId → users.farmId` — that path breaks precisely for guest-mode workdays.
- `harvesterWorkday` — `{ _id, farmId, workdayId, harvesterId, workdayNumber, addedAt, syncedOffline }` — the day's roster (which harvesters are working that workday), decoupled from `harvestEntries` so someone shows up in the recorder's list before their first delivery. `workdayNumber` is a per-workday correlative (1, 2, 3...) assigned locally on-device (not a server-issued global sequence) so it works fully offline — unique per `workdayId`, never a global worker ID. `farmId` is denormalized from the workday (cheap — already in memory on-device) so tenant-filtered queries never need a `$lookup`.
- `harvestEntries` — `{ _id, farmId, workdayId, harvesterId, measurementUnitId, unitCount, totalKg, recordedAt, syncedOffline }` — references `harvesterId`+`workdayId` directly (not via `harvesterWorkday._id`) to avoid an extra lookup in the local write hot path. `farmId` denormalized for the same reason as above — this is the highest-volume collection in the system, so every query here needs tenant scoping without a join.

### DTO structure (server-app)

Every entity module owns a `dto/` folder, structured by direction first, then by action — only create the files an implemented endpoint actually needs, don't pre-generate the full set:

```
src/<entity>/
  dto/
    request/
      create-<entity>-request.dto.ts        # export class Create<Entity>RequestDto
      find-<entity>-request.dto.ts          # export class Find<Entity>RequestDto
      find-by-id-<entity>-request.dto.ts    # export class FindById<Entity>RequestDto
    response/
      create-<entity>-response.dto.ts       # export class Create<Entity>ResponseDto
      find-<entity>-response.dto.ts         # export class Find<Entity>ResponseDto
      find-by-id-<entity>-response.dto.ts   # export class FindById<Entity>ResponseDto
    types/                                   # optional — only if the module needs a standalone type/interface that doesn't fit the entity/request/response split
    <entity>.dto.ts                          # export class <Entity>Dto — the entity's canonical shape
    index.ts                                 # barrel — re-exports everything under dto/
  schemas/<entity>.schema.ts
  <entity>.module.ts
```

Rules:
- One DTO class per file. The filename is kebab-case and matches the exported class name 1:1 (e.g. `create-farm-response.dto.ts` exports `CreateFarmResponseDto`).
- Split by direction first (`request/` = what the client sends, `response/` = what the endpoint returns), then by action inside each (`create`, `find`, `find-by-id`, `update`, ...), mirroring the controller's operations.
- `<entity>.dto.ts` (e.g. `farm.dto.ts` → `FarmDto`) is the module's canonical DTO: the entity's shape independent of any specific action. Request/response DTOs for individual actions are typed against it (extend or compose from `<Entity>Dto`) instead of re-declaring the same fields and `class-validator` decorators per action — a field added to the entity's shape shouldn't require hunting down every action's DTO separately.
- `types/` is optional — add it only when a module needs a standalone type/interface that isn't itself a request, a response, or the entity shape.
- Other layers (controller, service, other modules) import from `<entity>/dto` (the barrel), never by reaching into `dto/response/...` or `dto/request/...` directly.

### Key behavioral constraints that should drive design decisions

- **Offline-first is non-negotiable**: all writes during a workday happen locally first in `ui-app`'s SQLite store; server sync is a distinct, explicit action.
- **Sub-100ms tap-to-record latency**: the "Anotar" (record) interaction in `ui-app` must never block on network I/O — it only touches local SQLite.
- **Everything configurable at runtime**: fruits, units of measure, and their kg conversion factors are data-driven (Mongo documents), never hardcoded — adding a new fruit or container type must not require code changes in `server-app`.
- **Dual recording modes**: container-counting (converted via `kgFactor`) vs. direct-weighing (weight entered straight from a scale) — the same workday/UI should support switching modes. In the field UI these are "conteo de envases" / "pesaje directo" (Spanish copy, see below); at the code level they're just `unitCount` × `kgFactor` vs. a unit with `kgFactor = 1`.
- **Field UX** (`ui-app`): large touch targets usable one-handed and in direct sunlight, high-contrast display, terminology matching field workers' actual Spanish vocabulary ("Anotar", "Tarro", "Vuelta") rather than generic technical terms — see the naming-convention note above: this is UI copy, not a reason to name entities/fields in Spanish.
- **Multi-tenant isolation is non-negotiable**: every collection carries `farmId`, and every `server-app` query must filter by it directly — never rely on a transitive join (e.g. through `recorderId`) to scope by tenant, since nullable fields like `workdays.recorderId` (guest mode) break that path. A forgotten `farmId` filter is a cross-tenant data leak, not just a bug.

### Deployment target (not yet configured)

`server-app` is intended for a managed PaaS (Railway or Render) with MongoDB Atlas as the database — no infra/CI is set up yet, and no Atlas cluster or connection string has been wired into the app.

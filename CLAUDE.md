# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

The tech stack has been chosen and both apps are underway. `server-app` has the full harvest-tracking vertical slice implemented end-to-end — farms (create, plus `GET`/`PATCH /farms/me` for the caller's own farm settings), auth (Firebase), fruits/harvesters/measurement-units catalogs (create/list/partial-update via `PATCH /:id`, the latter also doubling as activate/deactivate), a `users` controller (`GET /users`, admin-only — lists the caller farm's team), workdays (open/close), and the harvester-workday/harvest-entries offline-sync endpoints — following the DTO/service/controller conventions below, plus a `/health` check and rate limiting on auth. `AuthModule` imports both `UsersModule` and `FarmsModule` via `forwardRef()` (Auth needs both for registration; both now need Auth's guards for their own controllers) — a legitimate, NestJS-sanctioned pattern for a genuine two-way dependency, not something to "fix" by removing. **Mongoose gotcha worth knowing**: adding a `required` field to an existing schema (`Workday.clientEntryId`, `Farm.recordersCanManageCatalog`) doesn't backfill it onto documents already in the database — a `.save()` on one of those old documents re-validates the *whole* document and throws (this broke `PATCH /workdays/:id/close` in practice); the fix pattern used throughout is `findOneAndUpdate` with a targeted `$set` (skips validation by default) instead of fetch-mutate-`.save()`, plus `?? <default>` in the service's `toDto()` for reads. Known gaps: CI, e2e coverage beyond the scaffold test, and PaaS deployment aren't set up yet (see [arquitectura.md §3–5](docs/diagrams/arquitectura.md)).

`ui-app` has the **full core loop working end-to-end and verified on a physical device via Expo Go**: auth (Firebase email/password) → onboarding (create/join farm) → catalogs → open a workday → build the day's roster (`add-harvester`) → record deliveries in the Anotador (RF-02: -1/+1/+2/+5, or an exact-weight dialog for direct-weighing units with `kgFactor=1`) → sync pending local data to the server → close the workday (hard-blocked while anything's unsynced, since the server freezes the total from what it already has). Runs on Expo SDK 57. See [docs/diagrams/ui-arquitectura.md](docs/diagrams/ui-arquitectura.md) for the architecture and its known-gaps section.

Navigation: `(app)/(drawer)/(tabs)` holds Home/History as bottom tabs; a Drawer wraps that plus Profile, Settings, the catalogs, and Team — all fully built now, no placeholders left in `(app)/`. `fruits`/`harvesters`/`measurementUnits` are cached locally (`lib/catalogSync.ts`) and support full editing + activate/deactivate; adding an *existing* harvester to a roster works offline, registering a genuinely *new* one still needs connectivity (a bigger, explicitly-deferred gap — see [ui-arquitectura.md](docs/diagrams/ui-arquitectura.md) for the design it would need). Whether a *recorder* sees the catalog screens at all is one per-farm toggle (`farms.recordersCanManageCatalog`, default `true`, edited from Settings) — not per-user permissions; `/team` (the farm's user list) is unaffected by that toggle and stays admin-only via `RolesGuard` (`src/auth/guards/roles.guard.ts`, the project's first role check), the same guard `/users/me` and `/farms/me` (Profile, Settings) override at the method level to allow any authenticated member through. `POST /workdays` and `PATCH /workdays/:id/close` are both idempotent via `clientEntryId`/frozen-state-on-retry, respectively. See ui-arquitectura.md's "Estado actual y próximos pasos" for exactly what's verified on-device vs. not yet.

Full requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (written in Spanish). The Mongo-based domain model below supersedes the SQL DDL in that document — REQUIREMENTS.md still describes the original relational proposal and hasn't been updated yet. [docs/diagrams/arquitectura.md](docs/diagrams/arquitectura.md) records architectural decisions beyond REQUIREMENTS.md — module boundaries, API versioning, offline-sync/idempotency design, deployment posture — treat it as decided direction, not current state; several of its decisions aren't implemented yet (see below). [docs/diagrams/ui-arquitectura.md](docs/diagrams/ui-arquitectura.md) records the equivalent decisions for `ui-app` (UI library, theming, local persistence, navigation).

**Naming convention**: entity/collection names, field names, enum values, function/variable names — everything at the code level — is in English. This is a deliberate split from `ui-app`'s field-facing copy, which stays in Spanish (RNF-02: the terminology field workers actually use — "Anotar", "Tarro", "Vuelta" — not generic technical terms). Code in English, UI copy localized to the end user; don't let one leak into the other (e.g. don't name a collection `cosechadores`, and don't hardcode an English button label a Chilean field worker would read).

## Project Overview

NovaFarm (formerly AnotaYa, also referred to during earlier planning as AnotaCampo / AnotaAgro) digitizes manual fruit-harvest tracking currently done on paper in the field. It replaces pen-and-paper tally marks with a fast mobile interface for recording harvest deliveries per worker, while working fully offline in areas without network coverage.

## Architecture

Two independent apps, no shared workspace/monorepo tooling between them:

- **`ui-app/`** — React Native + Expo (TypeScript) field client. Offline-first: all capture happens locally in SQLite (`expo-sqlite`); syncing to the server is a separate, explicit, user-triggered action ("Sincronizar Jornada"), never automatic.
- **`server-app/`** — NestJS (TypeScript) backend. Receives synced data, persists to MongoDB Atlas via Mongoose (`@nestjs/mongoose`), validates payloads with DTOs (`class-validator`/`class-transformer`).

Both apps use **pnpm** (pinned via `packageManager` in each `package.json`, currently `pnpm@10.17.0`), not npm — no `package-lock.json`, use `pnpm-lock.yaml`.

`server-app` is a modular monolith (one deployable, feature modules talking in-process via Nest DI — not microservices) — see [arquitectura.md §1](docs/diagrams/arquitectura.md) for why. One seam to watch: every entity module today exports raw `MongooseModule` (e.g. `FarmsModule`), which lets any importer bypass the owning module's business rules via direct `@InjectModel`. The intended convention going forward is each module exports its own `*Service` with purpose-built methods instead — cross-module reads/writes should go through that service, not a shared Mongoose model.

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
`server-app` needs a reachable MongoDB before `start:dev`/`start` finishes booting — `MongooseModule.forRootAsync` in `src/database/database.module.ts` blocks startup until it connects. Either set `MONGODB_URI_ATLAS` in `server-app/.env` (gitignored, see `.env.example`) and run `pnpm start:dev` on the host, or run `docker compose up` in `server-app/` — this builds the `dev` stage of `Dockerfile` (hot-reload via `nest start --watch`, source bind-mounted) alongside a local Mongo container, and always points at that local Mongo regardless of what `.env` has (never touches a real Atlas cluster). `server-app/Dockerfile` also has a `runtime` target (the default, used by `docker build .` with no `--target`) — a minimal multi-stage production image (no devDependencies, non-root user) for Railway/Render.

Watch mode (both bare `pnpm start:dev` and the `dev` Docker target) relies on `tsconfig.json`'s `watchOptions` (polling-based) — needed because native filesystem-change events don't reliably cross a Docker Desktop bind mount on Windows; don't remove it without confirming hot-reload still works inside the container.

**ui-app** (Expo):
```
pnpm start   # expo start — scan QR with Expo Go, or press a/i/w
pnpm android
pnpm ios
pnpm web
pnpm db:generate   # drizzle-kit generate — regenerate SQLite migrations after editing db/schema.ts
pnpm generate:api   # orval — regenerate the typed API client (needs server-app running, see below)
```
`ui-app/.npmrc` sets `node-linker=hoisted` — required for Metro's module resolution to work correctly with pnpm's non-flat `node_modules` layout; don't remove it without testing the Metro bundler still resolves everything.

`ui-app/AGENTS.md` (referenced from `ui-app/CLAUDE.md`) flags that Expo APIs have changed recently — check the versioned docs at the SDK version in `ui-app/package.json` (`expo` dependency) before writing Expo-specific code.

`pnpm generate:api` (in `ui-app/`) regenerates the typed API client from `server-app`'s live OpenAPI spec via `orval` (`orval.config.js`) — **requires `server-app` running locally** (reads `http://localhost:3000/api-docs-json`, overridable via `NOVAFARM_API_SPEC_URL`). Generates axios-based client functions into `ui-app/api/generated/` (one file per controller tag, e.g. `farms.ts`), routed through the shared instance in `ui-app/api/axios-instance.ts` (`AXIOS_INSTANCE` — configure `baseURL`/auth interceptors there, not per call site). Generated output is committed to git, not gitignored — regenerating requires a running server, so a fresh clone would otherwise have no usable client until someone stands up `server-app` + Mongo first. Re-run it after any DTO/controller change in `server-app`.

### Data model (MongoDB collections, server-app)

Adapted from the original relational DDL in REQUIREMENTS.md §4 — same business meaning, but referential integrity (`fruitId`, `harvesterId`, `measurementUnitId` references) is enforced at the application layer, not by the database. Entity/field names are English per the naming convention above (REQUIREMENTS.md still uses the original Spanish names — not yet updated). Full diagram and rationale: [docs/diagrams/modelo-datos.md](docs/diagrams/modelo-datos.md).

- `farms` — `{ _id, name, type: 'organization'|'independent', invitationCode, active, createdAt }` — the tenant. Every other collection carries a `farmId` and belongs to exactly one farm; no cross-farm data access. No `adminId` field — a farm's admin(s) are derived via `users` where `farmId` matches and `role: 'admin'`. `invitationCode` is what a `recorder` enters during onboarding to join; regenerable by an admin (no expiry yet). `type` is UI-only (whether to show the "invite your team" step after creation), no backend logic differs.
- `users` — `{ _id, farmId, name, email, firebaseUid, nationalId?, role: 'recorder'|'admin', active }` — authenticated users of `ui-app`. Auth is delegated to **Firebase Authentication**: `ui-app` logs in directly against Firebase's client SDK, `server-app` never handles a password and only verifies the resulting ID token via `firebase-admin`, with `farmId`/`role` carried as custom claims on that token; `firebaseUid` links the document back to the Firebase user. `farmId` is **required, never null** — "working independently" auto-creates a 1-member farm rather than leaving a user tenant-less (this is a different concern than `workdays.recorderId` being nullable: that's about attribution, this is about data isolation — a null farmId risks two users seeing each other's data). Login requires connectivity once; the session/token is then persisted locally on-device (refreshed in the background by the Firebase SDK) and only re-checked at sync time — local capture (RNF-01) never depends on it. Onboarding order: ask role first (recorder/admin), then affiliation — admin creates a farm (labeled either "for my team" or "independent", same backend action, differs only in `type` and post-creation UI); recorder joins an existing farm via `invitationCode`. There is no "independent recorder" path — working alone still requires admin-level catalog control.
- `harvesters` — `{ _id, farmId, firstName, lastName, nickname?, nationalId?, active }` — persistent worker catalog, **scoped per farm** (not global — a farm's roster, including PII like `nationalId`, must not be visible to another farm). `firstName`+`lastName` is **not** a uniqueness key — two different people can share a name; identity is `_id`. `nationalId` is optional/nullable (not collected at quick field registration, filled in later by an admin). `nickname` is optional and exists to help disambiguate repeated names.
- `fruits` — `{ _id, farmId, name, icon, active }` — fully configurable catalog, never hardcoded, **scoped per farm** (unique index is compound `{ farmId, name }`, not global — two farms can each have their own "Lemon"). `icon` is a free-text emoji chosen by the admin (not a curated icon set), optional at the schema level with a generic fallback (`DEFAULT_FRUIT_ICON`, `fruits/schemas/fruit.schema.ts`) applied in `toDto()` for fruits created before this field existed — same `?? <default>` pattern as `recordersCanManageCatalog`.
- `measurementUnits` — `{ _id, farmId, name, kgFactor, active }` — conversion factor to kilos (e.g., 10kg crate → 10.000); a unit can also represent direct-weighing mode where the entered value is already kilos. Scoped per farm, same reasoning as `fruits`.
- `workdays` — `{ _id, farmId, date, fruitId, defaultMeasurementUnitId, status: 'OPEN'|'CLOSED', createdAt, finalTotalKg, recorderId? }` — closing a workday (RF-01.2) should compute and freeze aggregate totals into the document itself rather than recomputing via aggregation on every read. `recorderId` is optional (nullable = guest-mode workday) — but `farmId` is **never** null even then; it's set from the device/session's active farm at workday-creation time, independent of `recorderId`. Don't derive `farmId` transitively via `recorderId → users.farmId` — that path breaks precisely for guest-mode workdays.
- `harvesterWorkday` — `{ _id, farmId, workdayId, harvesterId, workdayNumber, addedAt, syncedOffline }` — the day's roster (which harvesters are working that workday), decoupled from `harvestEntries` so someone shows up in the recorder's list before their first delivery. `workdayNumber` is a per-workday correlative (1, 2, 3...) assigned locally on-device (not a server-issued global sequence) so it works fully offline — unique per `workdayId`, never a global worker ID. `farmId` is denormalized from the workday (cheap — already in memory on-device) so tenant-filtered queries never need a `$lookup`.
- `harvestEntries` — `{ _id, farmId, workdayId, harvesterId, measurementUnitId, unitCount, totalKg, recordedAt, syncedOffline }` — references `harvesterId`+`workdayId` directly (not via `harvesterWorkday._id`) to avoid an extra lookup in the local write hot path. `farmId` denormalized for the same reason as above — this is the highest-volume collection in the system, so every query here needs tenant scoping without a join.

### API layer (server-app)

`main.ts` wires three things globally rather than per-controller: a `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted` — a client can't smuggle in a server-assigned field, e.g. `farms.invitationCode`); a global `api/v1` prefix (`app.setGlobalPrefix('api/v1', { exclude: ['health'] })`, per [arquitectura.md §2](docs/diagrams/arquitectura.md)) so every controller route is served under `/api/v1/...` except `/health` (kept stable and unprefixed since it's an infrastructure check, not part of the versioned contract); and `@nestjs/swagger`, which auto-documents any DTO decorated with `@ApiProperty()` at `/api-docs` (mounted only when `NODE_ENV !== 'production'`, and itself unaffected by the prefix since it mounts on the underlying HTTP adapter directly).

### DTO structure (server-app)

Every entity module owns a `dto/` folder, structured by direction first, then by action — only create the files an implemented endpoint actually needs, don't pre-generate the full set. `server-app/src/farms/` is a working reference implementation of this structure end to end (schema → DTOs → service → controller) — copy its shape for the next module rather than re-deriving it:

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
- **Multi-tenant isolation is non-negotiable**: every collection carries `farmId`, and every `server-app` query must filter by it directly — never rely on a transitive join (e.g. through `recorderId`) to scope by tenant, since nullable fields like `workdays.recorderId` (guest mode) break that path. A forgotten `farmId` filter is a cross-tenant data leak, not just a bug. Enforcement mechanism: identity is handled by **Firebase Authentication**, not a homegrown JWT — `ui-app` signs up/in directly against Firebase (client-side, via the `firebase/auth` SDK), and login never passes through `server-app`. `server-app` only verifies the Firebase ID token the client presents, via `firebase-admin` (`src/auth/firebase-admin.service.ts`); `farmId`/`role` travel as custom claims set on the Firebase user at the end of registration (`admin.auth().setCustomUserClaims`). A `FarmScopeGuard` (`src/auth/guards/farm-scope.guard.ts`) verifies the token and requires those claims to be present, and a `@CurrentFarm()` param decorator (`src/auth/decorators/current-farm.decorator.ts`) reads `farmId` off the request it populates — both live in `src/auth/` and are exported from `AuthModule` for reuse by other modules. Applied via `@UseGuards(FarmScopeGuard)` on every entity controller that reads/writes tenant data — `fruits`, `harvesters`, `measurement-units`, `workdays`, `harvester-workday`, `harvest-entries`, `users` — so any new entity controller should follow the same pattern. `farms.controller.ts` is the deliberate exception (no guard): its one route creates the tenant itself, before a `farmId` claim can exist. For routes that also need to restrict *which* farm member can call them (not just that they belong to a farm), pair `FarmScopeGuard` with `RolesGuard` (`src/auth/guards/roles.guard.ts`) + `@Roles('admin')` — `users.controller.ts`'s `GET /users` is the first and so-far-only route using this; everything else is reachable by any authenticated farm member regardless of role.

### Deployment target (not yet configured)

`server-app` is intended for a managed PaaS (Railway or Render), on an always-on paid tier (not sleep/free — sync traffic is bursty and infrequent, so a cold start would hit exactly when a user needs the one network-dependent moment in their workflow). A real MongoDB Atlas connection string is now wired for local development via `MONGODB_URI_ATLAS` in `server-app/.env` (gitignored). `server-app/Dockerfile` exists and is verified working (production `runtime` target boots against real Atlas; `dev` target boots via `docker-compose` against local Mongo) — hosting and CI/CD are still not set up. Full reasoning — security posture, secrets handling, CORS for `ui-app`'s web target, known gaps — in [arquitectura.md §3–5](docs/diagrams/arquitectura.md).

---
paths:
  - "ui-app/**"
---

# ui-app (React Native + Expo) — conventions and current state

## Expo has changed recently

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo-specific code — check the `expo` dependency in `ui-app/package.json` if that version ever moves. (Same warning lives in `ui-app/AGENTS.md`, which non-Claude tools read.)

## Status

The **full core loop works end-to-end and is verified on a physical device via Expo Go**: auth (Firebase email/password) → onboarding (create/join farm) → catalogs → open a workday → build the day's roster (`add-harvester`) → record deliveries in the Anotador (RF-02: -1/+1/+2/+5 for a `COUNT` unit, or a weight dialog for a `WEIGHT` one) → sync pending local data to the server → close the workday (hard-blocked while anything's unsynced, since the server freezes the total from what it already has). **The whole capture half of that loop runs offline** (2026-09-05): opening the workday, registering brand-new harvesters and recording deliveries all write to SQLite first. Only closing and syncing need signal. The manual sync uploads in four stages, in this order — workday → harvesters → roster → entries — because each stage needs the server `_id` the previous one produces; see ui-arquitectura.md before changing it. Runs on Expo SDK 57. See [docs/diagrams/ui-arquitectura.md](../../docs/diagrams/ui-arquitectura.md) for the architecture and its known-gaps section.

Navigation: `(app)/(drawer)/(tabs)` holds Home/History as bottom tabs; a Drawer wraps that plus Profile, Settings, the catalogs, and Team — all fully built, no placeholders left in `(app)/`. `products`/`harvesters`/`measurementUnits` are cached locally (`lib/catalogSync.ts`) and support full editing + activate/deactivate; registering a harvester works fully offline too (2026-09-05) — `quickRegister` writes locally with `synced: false` and `lib/harvesterSync.ts` uploads it via `POST /harvesters/sync` at the start of the manual sync, rewriting the local id for the server one across `harvester_workday`/`harvest_entries`; deliberately never on reconnect, see [ui-arquitectura.md](../../docs/diagrams/ui-arquitectura.md). Whether a *recorder* sees the catalog screens at all is one per-farm toggle (`farms.recordersCanManageCatalog`, default `true`, edited from Settings) — not per-user permissions; `/team` (the farm's user list) is unaffected by that toggle and stays admin-only on the server. `POST /workdays` and `PATCH /workdays/:id/close` are both idempotent via `clientEntryId`/frozen-state-on-retry, respectively. See ui-arquitectura.md's "Estado actual y próximos pasos" for exactly what's verified on-device vs. not yet.

## Commands

```
pnpm start   # expo start — scan QR with Expo Go, or press a/i/w
pnpm android
pnpm ios
pnpm web
pnpm db:generate   # drizzle-kit generate — regenerate SQLite migrations after editing db/schema.ts
pnpm generate:api   # orval — regenerate the typed API client (needs server-app running, see below)
```

`ui-app/.npmrc` sets `node-linker=hoisted` — required for Metro's module resolution to work correctly with pnpm's non-flat `node_modules` layout; don't remove it without testing the Metro bundler still resolves everything.

`pnpm generate:api` regenerates the typed API client from `server-app`'s live OpenAPI spec via `orval` (`orval.config.js`) — **requires `server-app` running locally** (reads `http://localhost:3000/api-docs-json`, overridable via `NOVAFARM_API_SPEC_URL`). Generates axios-based client functions into `ui-app/api/generated/` (one file per controller tag, e.g. `farms.ts`), routed through the shared instance in `ui-app/api/axios-instance.ts` (`AXIOS_INSTANCE` — configure `baseURL`/auth interceptors there, not per call site). Generated output is committed to git, not gitignored — regenerating requires a running server, so a fresh clone would otherwise have no usable client until someone stands up `server-app` + Mongo first. Re-run it after any DTO/controller change in `server-app`.

## Field UX and copy

- **Sub-100ms tap-to-record latency**: the "Anotar" (record) interaction must never block on network I/O — it only touches local SQLite (`expo-sqlite` via Drizzle).
- **Offline-first is non-negotiable**: all writes during a workday happen locally first; server sync is a distinct, explicit, user-triggered action ("Sincronizar Jornada"), never automatic.
- Large touch targets usable one-handed and in direct sunlight, high-contrast display.
- Copy is **Spanish** — the terminology field workers actually use ("Anotar", "Tarro", "Vuelta"), not generic technical terms (RNF-02). Code identifiers stay English; see the naming convention in CLAUDE.md. The clearest live example of that split: the entity is `products`/`productId` in code but reads **"Cultivo"/"Cultivos"** on screen — general enough in the model to hold a vegetable or a nut, specific enough in the UI to sound like the business. If the word ever needs to change it's one strings file, not a migration. In the field UI the two recording modes read as "contando envases" / "pesando cada uno"; at the code level they're the unit's `mode` (`COUNT` / `WEIGHT`), never inferred from `kgFactor`.
- **The manual sync logs every step** (`lib/syncLog.ts`, `__DEV__` only): one line per stage of the four-stage saga (workday → harvesters → roster → entries) with counts and elapsed ms, one line per chunk when the entries go in several, and a closing line. It exists so a "sync left things pending" report from the field can be read back to the exact stage that broke, and it deliberately mirrors the server's `logSyncBatch` wording. Any future flow that chains writes across entities should log the same way.
- **Money is always shown through `formatCLP()` (`lib/format.ts`)**: whole Chilean pesos with a dot thousands separator (`$12.500`), never a bare `toFixed()` or a raw number. Amounts per harvester come from `lib/pay.ts` (`computePay`/`sumPay`), never recomputed inline — the day's total has to be exactly the sum of the per-person amounts, each already rounded to the peso, or the paper handed to the harvester and the one handed to the boss differ by a few pesos. A workday whose `payRate`/`payBasis` are null shows **nothing** about money anywhere (Cerrar Jornada, the history detail, the PDF) — never `$0`.
- **The control weight (`measuredKg`) is never mixed into a total.** It's an optional per-round weighing on a fixed-weight container, summarized only through `lib/weighing.ts` (`summarizeWeighing`), which compares the weighed rounds against what those same rounds are worth by catalog — never against the day's total. It shows as its own labeled block ("Pesaje de control"), always alongside the line saying it changes neither the total nor the pay. It is entered **only** from the Anotador rounds dialog (the (!) per harvester), never from the +1/+2/+5 fast path: weighing a fixed-weight container is the exception, and a button there would have to answer whose weight it is when the round was 3 containers. Saving one re-queues that entry (`synced: false`) so the next sync pushes it; the server then updates just that field.
- **Kilos are always shown through `formatKg()` (`lib/format.ts`)**: one decimal, comma separator — never a bare `toFixed()`, which prints a dot and reads wrong to a Chilean field worker. Any field where a weight is typed masks with `sanitizeDecimalInput()` as the user types (so a rejected third decimal never silently becomes a rounded save) and parses with `parseDecimalInput()`, which accepts comma *and* dot because Android's `decimal-pad` shows whichever the phone's locale uses. One decimal is the resolution of the whole system, on both apps.

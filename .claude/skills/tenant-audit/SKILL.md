---
description: Audit server-app changes for missing farmId scoping and other multi-tenant isolation holes before they ship.
disable-model-invocation: true
argument-hint: [git-diff-args, e.g. main...HEAD — defaults to uncommitted changes]
---

# Multi-tenant isolation audit

## Changes under review

!`git --no-pager diff $ARGUMENTS -- server-app/src`

If that diff is empty, audit the files the user names instead; if they named none, audit every `*.service.ts` under `server-app/src`.

## What to check

Every collection carries `farmId` and every query must filter by it **directly**. A forgotten filter is a cross-tenant data leak — another farm's harvesters, their workers' `nationalId`, their production totals. Treat a finding here as a security bug, not a style note.

1. **Every model call is scoped.** `find`, `findOne`, `findById`, `findOneAndUpdate`, `updateOne`, `updateMany`, `deleteOne`, `countDocuments`, `aggregate` — each one needs `farmId` in its filter. `findById(id)` is almost always wrong on its own: it trusts a client-supplied id with no tenant check. Aggregation pipelines need `farmId` in the **first** `$match`.
2. **`farmId` comes from the token.** It must originate from `@CurrentFarm()` (populated by `FarmScopeGuard` from the Firebase custom claims), never from a request body, query param or URL segment. A request DTO declaring a `farmId` field is a red flag even though the global `whitelist`/`forbidNonWhitelisted` pipe would reject the extra property.
3. **No transitive scoping.** Scoping through `recorderId → users.farmId`, or through any `$lookup`, is wrong even when it appears to work: `workdays.recorderId` is nullable in guest mode, so that path silently loses its filter exactly where it matters.
4. **Writes set the denormalized `farmId`.** New `harvestEntries` / `harvesterWorkday` documents must carry the caller's `farmId`, taken from the session, not copied from a related document the client pointed at.
5. **Cross-references are validated inside the tenant.** A `fruitId`, `harvesterId` or `measurementUnitId` arriving from the client must be resolved with the caller's `farmId` (e.g. `findActiveById(farmId, id)`) before being stored — otherwise one farm can attach another farm's catalog entry to its own data.
6. **The controller is guarded.** `@UseGuards(FarmScopeGuard)` on the class, plus `RolesGuard` + `@Roles('admin')` where the route is admin-only. `farms.controller.ts`'s create route is the one legitimate unguarded endpoint (it creates the tenant itself); anything else unguarded is a finding. Note that `/users/me` and `/farms/me` deliberately override the admin role check at method level so any member can read their own profile/farm settings.
7. **Sync endpoints are still scoped.** Offline batch endpoints take arrays of client-generated records; each item must be written under the caller's `farmId`, and `clientEntryId` idempotency lookups must be farm-scoped too — otherwise one farm's replay can collide with another's.
8. **Errors don't leak existence.** A document belonging to another farm should read as 404, not 403 — a 403 confirms the id exists somewhere.

## How to report

For each finding: the file and line, which of the checks above it breaks, and a concrete scenario — *farm A calls X with farm B's id and gets/writes …*. Rank by exploitability. If the diff is clean, say so in one line; don't invent findings. Then offer to fix, don't fix unasked.

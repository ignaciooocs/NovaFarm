---
description: Scaffold a new tenant-scoped entity module in server-app (schema, DTOs, service, controller, module, spec) following the fruits/ reference structure. Use when adding a new MongoDB collection or feature module to the NestJS backend.
argument-hint: <entity-singular> (e.g. shift, payment)
---

# New server-app module: $ARGUMENTS

## Modules that already exist

!`ls -1 server-app/src`

## What to build

Scaffold `server-app/src/<entities>/` for the entity named in the argument. Use `server-app/src/fruits/` as the working reference — read it first and copy its shape rather than re-deriving the conventions. `farms/` is **not** the template to copy: it's the deliberate exception with no `FarmScopeGuard`, because its one route creates the tenant itself.

Directory name and controller route are **plural kebab-case** (`measurement-units`), class prefix is **PascalCase singular** (`MeasurementUnit`). Read `templates.md` in this skill directory for the file-by-file boilerplate.

Files to create:

```
src/<entities>/
  schemas/<entity>.schema.ts
  dto/
    <entity>.dto.ts                        # canonical shape — every other DTO composes from it
    request/create-<entity>-request.dto.ts
    request/find-<entity>-request.dto.ts   # only if the endpoint takes query filters
    request/update-<entity>-request.dto.ts # only if there is a PATCH
    response/create-<entity>-response.dto.ts
    response/find-<entity>-response.dto.ts
    response/update-<entity>-response.dto.ts
    index.ts                               # barrel — the ONLY import path other layers use
  <entities>.service.ts
  <entities>.service.spec.ts
  <entities>.controller.ts
  <entities>.module.ts
```

Only create the DTO files the endpoints you're actually implementing need — don't pre-generate the full set.

## Non-negotiables — check each one before finishing

1. **`farmId` on the schema**: `@Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })`. If the entity has a per-farm unique name, the index is compound (`schema.index({ farmId: 1, name: 1 }, { unique: true })`), never a global unique on `name` alone.
2. **`farmId` in every single query** — `create`, `find`, `findOne`, `findOneAndUpdate`, aggregations. Not one exception. A missing filter is a cross-tenant data leak, not a bug. Never scope transitively through another field (e.g. `recorderId`), because that path breaks for guest-mode workdays.
3. **`farmId` comes from the token, never the body**: controller takes `@CurrentFarm() farmId: string` and passes it as the service method's first parameter. The request DTO must not declare a `farmId` field.
4. **`@UseGuards(FarmScopeGuard)`** on the controller class, plus `@ApiBearerAuth()` and `@ApiTags('<entities>')`. Add `RolesGuard` + `@Roles('admin')` only if the route must be admin-only (see `users.controller.ts`).
5. **Updates use `findOneAndUpdate` + `$set`**, not fetch-mutate-`.save()`. A `.save()` re-validates the whole document and throws on older documents that predate a `required` field.
6. **`toDto()` is private and defensive**: convert `_id`/`farmId` with `.toString()`, and apply `?? <DEFAULT>` for any field added after the collection already had documents.
7. **Every `@ApiProperty()`** — the OpenAPI spec is what generates `ui-app`'s client, so an undecorated field silently disappears from the generated types.
8. **`Types.ObjectId.isValid(id)`** guard before querying by an id that came from the URL; return `null` from the service and let the controller throw `NotFoundException`.

## Conventions to match

- Identifiers, class names, DTO fields: **English**. Code comments in `server-app`: **Spanish**, explaining *why* (see `fruits.service.ts` for the tone). Don't flip either one.
- The module exports both `MongooseModule` and its own service, but other modules should consume the **service** (e.g. `findActiveById(farmId, id)`), not `@InjectModel` on a borrowed schema.
- Import `AuthModule` in the module's `imports` to get the guards.
- The spec mocks the model with `getModelToken(<Entity>.name)` and plain `jest.fn()`s — no in-memory Mongo. At minimum, test that the caller's `farmId` reaches the query and that a duplicate-key error becomes a `ConflictException`.

## Finish the job

1. Register the module in `server-app/src/app.module.ts`.
2. Run `pnpm lint` and `pnpm test` in `server-app/`.
3. Tell the user to run `pnpm generate:api` in `ui-app/` with the server running (or run the `/sync-api` skill) — the typed client won't know about the new endpoints until then.
4. If the entity is written offline on-device, say so explicitly: it also needs a local table in `ui-app/db/schema.ts` and a sync path, which this skill does not create.

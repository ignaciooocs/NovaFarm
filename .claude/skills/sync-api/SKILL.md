---
description: Regenerate ui-app's typed API client from server-app's live OpenAPI spec (orval) and fix whatever the regeneration breaks. Use after changing any DTO, controller, route or Swagger decorator in server-app.
---

# Regenerate the ui-app API client

`ui-app/api/generated/` is committed to git and only changes when someone runs `pnpm generate:api`, which reads **`server-app`'s running instance** at `http://localhost:3000/api-docs-json` (override with `NOVAFARM_API_SPEC_URL`). A `server-app` DTO change that isn't followed by this step leaves `ui-app` compiling against a stale contract.

## 1. Make sure the spec is reachable

```
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api-docs-json
```

If it isn't 200, the server isn't up. Don't start a long-running server in the foreground — either:

- ask the user to run `pnpm start:dev` in `server-app/` (or `docker compose up`), or
- start it in the background yourself and wait for the port to answer.

Swagger is only mounted when `NODE_ENV !== 'production'`, so a 404 on a running server means the env is wrong, not the route.

## 2. Regenerate

Run `pnpm generate:api` in `ui-app/`. `clean: true` is set in `orval.config.js`, so the generator **deletes and rewrites** `api/generated/` — any hand-edit in there is lost, which is intended: never edit generated files, change the `server-app` DTO instead.

## 3. Review the diff before trusting it

```
git --no-pager diff --stat ui-app/api/generated
```

Then look at the actual diff and classify it:

- **Added operations/fields** — safe, nothing else to do.
- **Renamed or removed operations** — every call site in `ui-app` breaks. Grep for the old exported function name and the old schema type across `ui-app/app`, `ui-app/lib` and `ui-app/db`, and update them.
- **A field that silently disappeared** — usually a DTO property missing its `@ApiProperty()` decorator, not an intentional removal. Check the DTO before "fixing" the UI around it.
- **The whole directory rewritten with no real change** — if only formatting/order moved, still commit it; a half-regenerated client is worse than either state.

## 4. Typecheck and report

Run `pnpm exec tsc --noEmit` in `ui-app/` and fix the breaks the new contract caused. Report to the user: which operations changed, which call sites you touched, and anything you left broken on purpose.

Both the generated client and any local SQLite shape it feeds (`ui-app/db/schema.ts`) may need to move together — if a synced field changed type or name, the local table and the sync code in `ui-app/lib/*Sync.ts` are part of the same change. Say so if you spot it; use the `/db-migration` skill for the local-schema half.

# ui-app: Arquitectura

> Decisiones de arquitectura para `ui-app`, análogas a lo que [arquitectura.md](arquitectura.md) y [modelo-datos.md](modelo-datos.md) documentan para `server-app`. Escrito al terminar el andamiaje base (dependencias, theme, persistencia local, navegación con pantallas placeholder) — antes de construir la lógica real de cada pantalla, para que esa construcción sea mecánica y no requiera re-decidir nada a mitad de camino.

## Decisiones

- **Librería de UI**: [React Native Paper](https://reactnativepaper.com/) (Material Design). Elegida por su sistema de theming centralizado ya integrado (`PaperProvider theme={theme}`) — encaja directamente con el pedido de "un solo lugar para los colores, fácil de cambiar" — y porque trae los componentes base (Button, TextInput, Card, etc.) ya construidos, evitando reconstruir primitivos desde cero.
- **Autenticación**: Firebase Auth con **email + contraseña**. Se descartó el login por SMS a propósito: depender de recibir un SMS choca con el contexto de la app (zonas rurales con mala cobertura) — el mismo problema que la app está diseñada para evitar en la captura de datos.
- **Persistencia local**: [Drizzle ORM](https://orm.drizzle.team/) sobre `expo-sqlite`. Da schema tipado y migraciones versionadas (`drizzle-kit`), en vez de SQL a mano — relevante porque el schema local va a evolucionar entre versiones de la app.
- **Estado global**: Zustand (ya estaba instalado antes de esta decisión). Se usa **solo** para estado de sesión/UI efímero (usuario autenticado, id de la jornada activa, conectividad) — los datos de dominio (catálogos, roster, entregas) viven en SQLite como única fuente de verdad, nunca duplicados en un store, para no arriesgar que las dos copias queden desincronizadas.
- **Modo oscuro**: fuera de alcance. `app.json` ya fija `userInterfaceStyle: "light"`. Para uso al sol directo (RNF-02), un solo tema claro de alto contraste bien afinado sirve mejor que dos temas a medio afinar.

## Theme y colores centralizados

- `theme/colors.ts` — la paleta base, el único lugar donde se define un color. Saturados y de alto contraste a propósito (RNF-02: legibilidad bajo sol directo, nada de tonos pasteles).
- `theme/theme.ts` — compone `colors.ts` sobre `MD3LightTheme` de Paper. Es el único objeto pasado a `<PaperProvider>`.
- `theme/spacing.ts` — escala de espaciado + `TOUCH_TARGET_MIN` (64dp — más grande que el mínimo de Material de 48dp, porque la mano puede estar sucia/con guante y "Anotar" es la acción más repetida de toda la app).
- Ningún componente debería importar un color hardcodeado — todo se lee de `theme/` (vía `useTheme()` de Paper, o directo de `colors.ts`).

## Copy en español centralizado

`constants/strings.ts` agrupa el copy de campo por pantalla/dominio ("Anotar", "Tarro", "Vuelta" — RNF-02). Mismo principio que los colores: un lugar para cambiar un texto, no una búsqueda pantalla por pantalla. No es i18n completo (`react-i18next`, etc.) a propósito — la app tiene un solo idioma de destino, así que un módulo de constantes alcanza sin agregar una capa de indirección de más.

## Persistencia local — Drizzle + expo-sqlite

`db/schema.ts` espeja el modelo de Mongo de `server-app` (mismos nombres de campo en inglés, misma convención código-en-inglés/copy-en-español del proyecto):

- `fruits`, `harvesters`, `measurementUnits` — caché local de solo lectura de los catálogos del server, refrescada cuando hay conexión.
- `workdays` — la jornada abierta en el dispositivo. `id` es un uuid local (instantáneo, sin red — RNF-01); `serverId` se completa una vez que `POST /workdays` contra `server-app` tiene éxito.
- `harvesterWorkday` — el roster del día. `workdayNumber` se calcula 100% local (máximo actual + 1), sin coordinación con el server. `id` hace de `clientEntryId` para el sync.
- `harvestEntries` — cada "Anotar". `id` también hace de `clientEntryId`.

**Gap conocido, pendiente de resolver en `server-app`**: a diferencia de `harvesterWorkday`/`harvestEntries` (que ya tienen `clientEntryId` + upsert idempotente en el server, ver el sync de esas dos colecciones), `POST /workdays` es una llamada en vivo sin idempotencia — si el dispositivo pierde conexión justo después de que el server crea la jornada pero antes de recibir la respuesta, un reintento podría crear una jornada duplicada. `modelo-datos.md` documenta que abrir una jornada debería funcionar offline igual que el resto de la captura; para que eso sea seguro en producción, `server-app` necesita el mismo patrón de `clientEntryId` + upsert que ya tienen las otras dos colecciones. No bloquea el desarrollo de `ui-app` (mientras haya conexión al abrir jornada, que es el caso común), pero hay que resolverlo antes de depender de la apertura de jornada 100% offline.

Migraciones: generadas por `drizzle-kit generate` (`pnpm db:generate`) en `drizzle/`, aplicadas una vez al arrancar la app (`app/_layout.tsx`, vía `useMigrations` de `drizzle-orm/expo-sqlite/migrator`, antes de renderizar cualquier pantalla).

**Detalle de bundler**: las migraciones se generan como archivos `.sql` importados directamente en JS (`drizzle/migrations.js`) — esto requiere `babel-plugin-inline-import` (`babel.config.js`) para que Babel los inserte como string en vez de intentar parsearlos como JavaScript, y `metro.config.js` necesita `sourceExts.push('sql')` para que Metro los reconozca como código fuente. La web de `expo-sqlite` además usa SQLite compilado a WASM (`wa-sqlite`), por lo que `metro.config.js` también necesita `assetExts.push('wasm')` para bundlear correctamente el target `--web`.

Cola de sync: toda fila con `synced=false` en `harvesterWorkday`/`harvestEntries` de la jornada activa es candidata a subir. "Sincronizar Jornada" las manda en lotes (≤500, mismo tope que `server-app` ya valida) a `/harvester-workday/sync` y `/harvest-entries/sync`; un resultado `created`/`already-synced` marca la fila local como sincronizada, `rejected` la deja pendiente y se muestra al usuario (RF-04.2).

## Estado global (Zustand)

- `stores/useAuthStore.ts` — usuario de Firebase actual, `farmId`/`role` (decodificados del custom claim del token vía `onIdTokenChanged`, no `onAuthStateChanged`, para capturar el refresh de claims post-onboarding). `isBootstrapping` evita mandar a alguien con sesión persistida a la pantalla de login solo porque Firebase todavía no terminó de leerla.
- `stores/useActiveWorkdayStore.ts` — solo el `id` local de la jornada activa (un puntero, no los datos — todo lo demás se lee de SQLite vía ese id).
- `stores/useConnectivityStore.ts` — flag online/offline vía `@react-native-community/netinfo`. Puramente informativo (el indicador de RF-04.2) — **nunca** dispara sync automático, el trigger sigue siendo el botón explícito "Sincronizar Jornada" (decisión ya tomada: automatizar el sync arriesga consumo de datos/batería inesperado justo en el contexto de campo que la app está diseñada para respetar).

## Capa de API

`api/generated/` (cliente tipado, generado por `orval` desde el OpenAPI de `server-app`) + `api/axios-instance.ts`. El interceptor de request en `AXIOS_INSTANCE` adjunta el ID token de Firebase (`auth.currentUser?.getIdToken()`) como Bearer en cada llamada — ningún call site arma ese header a mano. `pnpm generate:api` necesita `server-app` corriendo local; hay que re-correrlo después de cualquier cambio de DTO/controller ahí.

## Navegación (Expo Router)

```
app/
  index.tsx                # / — splash: decide a dónde redirigir según el estado de auth
  (auth)/
    login.tsx               # /login
    signup.tsx               # /signup
  (onboarding)/
    role.tsx                 # /role — ¿recorder o admin? (primero rol, después afiliación)
    create-farm.tsx          # /create-farm — admin: nombre + tipo
    invite-code.tsx           # /invite-code — admin: muestra el invitationCode
    join-farm.tsx              # /join-farm — recorder: ingresa el invitationCode
  (app)/
    home.tsx                  # /home — jornada abierta + historial + "Abrir Jornada"
    open-workday.tsx           # /open-workday — fecha / fruta / unidad por defecto
    workday/[id]/
      anotador.tsx              # RF-02: roster, 1-tap +1, +1/+2/+5/-1, totales en vivo
      add-harvester.tsx          # buscar en catálogo o registrar uno nuevo
      close.tsx                   # revisar totales y confirmar cierre (RF-01.2)
    sync.tsx                    # pendientes + "Sincronizar Jornada" + resultado por ítem
    (admin)/
      fruits.tsx, measurement-units.tsx, harvesters.tsx   # catálogos (solo admin)
      team.tsx                                              # stub — depende de un controller de `users` que aún no existe en server-app
    settings.tsx                # cerrar sesión, info de la farm
```

Todas las rutas ya existen con contenido placeholder (`components/PlaceholderScreen.tsx`), así que la navegación completa es recorrible de punta a punta desde el día uno. La lógica real de cada pantalla se construye en tareas siguientes, empezando por auth/onboarding, después el Anotador, después sync, después las pantallas de admin.

## Estructura de carpetas

```
ui-app/
  app/          # rutas de Expo Router (pantallas delgadas, sin lógica de negocio)
  api/          # cliente generado (orval) + axios instance con el interceptor de auth
  components/   # piezas de UI compartidas, compuestas sobre Paper (Screen, PlaceholderScreen, ...)
  theme/        # colores, spacing, theme de Paper
  constants/    # strings.ts (copy en español)
  db/           # schema de Drizzle, cliente, migraciones
  stores/       # zustand
  hooks/        # conectan db/api/stores con las pantallas (por construir)
  lib/          # helpers puros — firebase.ts, y en el futuro cálculo de kilos, chunking de sync, etc.
```

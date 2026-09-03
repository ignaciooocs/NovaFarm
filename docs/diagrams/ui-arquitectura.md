# ui-app: Arquitectura

> Decisiones de arquitectura para `ui-app`, análogas a lo que [arquitectura.md](arquitectura.md) y [modelo-datos.md](modelo-datos.md) documentan para `server-app`. Escrito originalmente al terminar el andamiaje base (dependencias, theme, persistencia local, navegación con pantallas placeholder), antes de construir la lógica real de cada pantalla — y actualizado a medida que esa lógica se fue construyendo. Ver la sección **Estado actual y próximos pasos** al final para el punto exacto en que quedó el desarrollo.

## Decisiones

- **Librería de UI**: [React Native Paper](https://reactnativepaper.com/) (Material Design). Elegida por su sistema de theming centralizado ya integrado (`PaperProvider theme={theme}`) — encaja directamente con el pedido de "un solo lugar para los colores, fácil de cambiar" — y porque trae los componentes base (Button, TextInput, Card, etc.) ya construidos, evitando reconstruir primitivos desde cero.
- **Autenticación**: Firebase Auth con **email + contraseña**. Se descartó el login por SMS a propósito: depender de recibir un SMS choca con el contexto de la app (zonas rurales con mala cobertura) — el mismo problema que la app está diseñada para evitar en la captura de datos.
- **Persistencia local**: [Drizzle ORM](https://orm.drizzle.team/) sobre `expo-sqlite`. Da schema tipado y migraciones versionadas (`drizzle-kit`), en vez de SQL a mano — relevante porque el schema local va a evolucionar entre versiones de la app.
- **Estado global**: Zustand (ya estaba instalado antes de esta decisión). Se usa **solo** para estado de sesión/UI efímero (usuario autenticado, id de la jornada activa, conectividad) — los datos de dominio (catálogos, roster, entregas) viven en SQLite como única fuente de verdad, nunca duplicados en un store, para no arriesgar que las dos copias queden desincronizadas.
- **Modo oscuro**: fuera de alcance. `app.json` ya fija `userInterfaceStyle: "light"`. Para uso al sol directo (RNF-02), un solo tema claro de alto contraste bien afinado sirve mejor que dos temas a medio afinar.
- **Navegación (2026-09-03)**: Tabs (Inicio/Historial — lo que se visita todo el tiempo) envueltas en un Drawer (todo lo demás: perfil, ajustes, catálogos, equipo, cerrar sesión). Decisión deliberada de mantener las tabs mínimas por RNF-02 — pocos botones grandes y claros — y mandar lo ocasional/administrativo al drawer en vez de acumularlo como botones sueltos en Home. Ver la sección **Navegación (Expo Router)** más abajo para la estructura de carpetas exacta.

## Theme y colores centralizados

- `theme/colors.ts` — la paleta base, el único lugar donde se define un color. Saturados y de alto contraste a propósito (RNF-02: legibilidad bajo sol directo, nada de tonos pasteles).
- `theme/theme.ts` — compone `colors.ts` sobre `MD3LightTheme` de Paper. Es el único objeto pasado a `<PaperProvider>`.
- `theme/spacing.ts` — escala de espaciado + `TOUCH_TARGET_MIN` (64dp — más grande que el mínimo de Material de 48dp, porque la mano puede estar sucia/con guante y "Anotar" es la acción más repetida de toda la app).
- Ningún componente debería importar un color hardcodeado — todo se lee de `theme/` (vía `useTheme()` de Paper, o directo de `colors.ts`).

## Copy en español centralizado

`constants/strings.ts` agrupa el copy de campo por pantalla/dominio ("Anotar", "Tarro", "Vuelta" — RNF-02). Mismo principio que los colores: un lugar para cambiar un texto, no una búsqueda pantalla por pantalla. No es i18n completo (`react-i18next`, etc.) a propósito — la app tiene un solo idioma de destino, así que un módulo de constantes alcanza sin agregar una capa de indirección de más.

## Persistencia local — Drizzle + expo-sqlite

`db/schema.ts` espeja el modelo de Mongo de `server-app` (mismos nombres de campo en inglés, misma convención código-en-inglés/copy-en-español del proyecto):

- `fruits`, `harvesters`, `measurementUnits` — caché local de solo lectura de los catálogos del server, refrescada por `lib/catalogSync.ts` (`syncCatalogs()`) vía upsert (`onConflictDoUpdate` de Drizzle, sobre `id` = `_id` del server); nunca lanza — sin conexión, la caché simplemente queda como estaba. Dos triggers, ambos fire-and-forget: `home.tsx` la llama en cada `useFocusEffect` (el punto natural "ya-online" del ciclo — se visita al iniciar sesión y al volver de cada jornada), y `bootstrapCatalogSyncOnReconnect()` (llamado una vez desde `app/_layout.tsx`, junto a los otros `bootstrap*`) la reintenta cada vez que `useConnectivityStore` pasa de desconectado a conectado — necesario porque en terreno la señal entra y sale, y el trigger de Home no alcanza si el dispositivo ya estaba parado en Home sin conexión y la recupera sin navegar a otra pantalla. Esto es un caso distinto del sync de datos capturados (`harvesterWorkday`/`harvestEntries`, más abajo): ese sigue siendo, a propósito, manual vía "Sincronizar Jornada" — automatizar el refresco de catálogos es seguro porque es solo lectura de referencia, no sube nada que el usuario capturó. `add-harvester.tsx` y el Anotador leen de estas tablas en vez de pedir en vivo; los catálogos de admin (`fruits.tsx`/`harvesters.tsx`/`measurement-units.tsx`) siguen pidiendo en vivo a propósito — administrarlos (crear/ver el estado más reciente) es una acción que de todos modos requiere conexión.
- `workdays` — la jornada abierta en el dispositivo. `id` se genera al entrar a `open-workday.tsx` (antes del primer submit, no después) y se manda como `clientEntryId` en el `POST /workdays`, reusado si el usuario reintenta — `server-app` ahora hace upsert por `{farmId, clientEntryId}` (mismo patrón que `harvesterWorkday`/`harvestEntries`), así que un reintento tras una respuesta perdida no duplica la jornada. Esto NO es lo mismo que abrir la jornada offline (`modelo-datos.md` lo deja como pendiente aparte): la llamada sigue necesitando conexión, lo que se arregló es que reintentarla sea seguro. `serverId` se completa una vez que esa respuesta llega con éxito. `createdByUid` (uid de Firebase de quien la abrió) filtra "la jornada activa" por cuenta, no por dispositivo — sin esto, dos cuentas distintas logueadas en el mismo celular en momentos distintos veían la jornada de la otra (bug real encontrado probando con dos cuentas en un mismo teléfono).
- `harvesterWorkday` — el roster del día. `workdayNumber` se calcula 100% local (máximo actual + 1), sin coordinación con el server. `id` hace de `clientEntryId` para el sync.
- `harvestEntries` — cada "Anotar". `id` también hace de `clientEntryId`.

**Gaps conocidos:**

1. **Registrar un harvester nuevo sigue necesitando conexión.** `add-harvester.tsx` ahora agrega al roster a cualquier harvester que la caché local ya conocía sin señal, pero el flujo de "registrar uno nuevo" (`handleQuickRegister`) llama a `harvestersControllerCreate` — es una entrada nueva en el catálogo del farm, y no hay (todavía) un modo offline con `clientEntryId` + upsert para crear catálogo, a diferencia de `harvesterWorkday`/`harvestEntries`. Impacto acotado: solo bloquea agregar a alguien que nunca estuvo en el catálogo, no a nadie que ya estaba.
2. **Abrir una jornada sigue siendo una acción 100% online** (a diferencia del resto de la captura). Lo que se arregló es la idempotencia del `POST /workdays` (ver el bullet de `workdays` arriba) — reintentarlo ya no duplica la jornada — pero no hay todavía un modo para encolar "abrir jornada" localmente y subirla después, como sí existe para el roster y las entregas. `modelo-datos.md` lo deja explícitamente como un gap aparte.

Migraciones: generadas por `drizzle-kit generate` (`pnpm db:generate`) en `drizzle/`, aplicadas una vez al arrancar la app (`app/_layout.tsx`, vía `useMigrations` de `drizzle-orm/expo-sqlite/migrator`, antes de renderizar cualquier pantalla).

**Detalle de bundler**: las migraciones se generan como archivos `.sql` importados directamente en JS (`drizzle/migrations.js`) — esto requiere `babel-plugin-inline-import` (`babel.config.js`) para que Babel los inserte como string en vez de intentar parsearlos como JavaScript, y `metro.config.js` necesita `sourceExts.push('sql')` para que Metro los reconozca como código fuente. La web de `expo-sqlite` además usa SQLite compilado a WASM (`wa-sqlite`), por lo que `metro.config.js` también necesita `assetExts.push('wasm')` para bundlear correctamente el target `--web`.

Cola de sync: toda fila con `synced=false` en `harvesterWorkday`/`harvestEntries` de la jornada activa es candidata a subir. "Sincronizar Jornada" las manda en lotes (≤500, mismo tope que `server-app` ya valida) a `/harvester-workday/sync` y `/harvest-entries/sync`; un resultado `created`/`already-synced` marca la fila local como sincronizada, `rejected` la deja pendiente y se muestra al usuario (RF-04.2).

## Estado global (Zustand)

- `stores/useAuthStore.ts` — usuario de Firebase actual, `farmId`/`role` (decodificados del custom claim del token vía `onIdTokenChanged`, no `onAuthStateChanged`, para capturar el refresh de claims post-onboarding). `isBootstrapping` evita mandar a alguien con sesión persistida a la pantalla de login solo porque Firebase todavía no terminó de leerla.
- `stores/useActiveWorkdayStore.ts` — solo el `id` local de la jornada activa (un puntero, no los datos — todo lo demás se lee de SQLite vía ese id).
- `stores/useConnectivityStore.ts` — flag online/offline vía `@react-native-community/netinfo`. Es el indicador de RF-04.2 y también la fuente que `lib/catalogSync.ts` escucha para reintentar el refresco de catálogos al reconectar (`bootstrapCatalogSyncOnReconnect`). Lo que **nunca** dispara automáticamente es el sync de datos capturados por el usuario — el trigger de eso sigue siendo el botón explícito "Sincronizar Jornada" (decisión ya tomada: automatizarlo arriesga consumo de datos/batería inesperado justo en el contexto de campo que la app está diseñada para respetar; el refresco de catálogos es solo lectura de referencia, así que no aplica la misma razón).

## Capa de API

`api/generated/` (cliente tipado, generado por `orval` desde el OpenAPI de `server-app`) + `api/axios-instance.ts`. El interceptor de request en `AXIOS_INSTANCE` adjunta el ID token de Firebase (`auth.currentUser?.getIdToken()`) como Bearer en cada llamada — ningún call site arma ese header a mano. `pnpm generate:api` necesita `server-app` corriendo local; hay que re-correrlo después de cualquier cambio de DTO/controller ahí.

## Navegación (Expo Router)

Desde 2026-09-03, `(app)/` está compuesto en tres niveles anidados — Stack (pantallas de flujo, a pantalla completa) envolviendo un Drawer (menú lateral) que a su vez envuelve las Tabs (los dos destinos que se visitan todo el tiempo). `expo-router` en SDK 57 trae su propio `Tabs`/`Drawer` (`expo-router/tabs`, `expo-router/drawer`) — ya no dependen de `@react-navigation/*` del proyecto (ver el cambio "Expo Router separado de React Navigation" de SDK 56). El Drawer necesita `react-native-gesture-handler`/`react-native-reanimated`/`react-native-worklets` — instalados directos (antes eran transitivos) y con `GestureHandlerRootView` envolviendo la raíz en `app/_layout.tsx`.

```
app/
  index.tsx                # / — splash: decide a dónde redirigir según el estado de auth              [real]
  (auth)/                  # _layout.tsx: guardia — ya logueado no puede volver acá
    login.tsx               # /login                                                                    [real]
    signup.tsx               # /signup                                                                  [real]
  (onboarding)/             # _layout.tsx: guardia — sin sesión o ya onboarded no puede estar acá
    role.tsx                 # /role — ¿recorder o admin? (primero rol, después afiliación)              [real]
    create-farm.tsx          # /create-farm — admin: nombre + tipo, llama a register/admin                [real]
    invite-code.tsx           # /invite-code — admin: muestra el invitationCode recién creado              [real]
    join-farm.tsx              # /join-farm — recorder: invitationCode, llama a register/recorder           [real]
  (app)/                    # _layout.tsx: Stack, guardia — requiere sesión + farmId (onboarding completo)
    (drawer)/                 # _layout.tsx: Drawer — menú lateral, headerShown:true (dueño del header salvo en (tabs))
      (tabs)/                   # _layout.tsx: Tabs — headerShown:true, headerLeft = DrawerToggleButton
        home.tsx                  # /home — jornada activa (por cuenta) o "Abrir Jornada"                  [real]
        history.tsx                # /history — jornadas cerradas (en vivo), fruta resuelta vs caché local [real]
      profile.tsx                # /profile — ítem del drawer                                            [placeholder]
      settings.tsx                # /settings — ítem del drawer (el logout vive en el drawer, no acá)      [placeholder]
      (admin)/                   # sin _layout.tsx propio — cada archivo es su propio ítem del Drawer
        fruits.tsx, measurement-units.tsx, harvesters.tsx   # lista + FAB/Dialog para crear                [real]
        team.tsx                                              # lista GET /users (solo admin) — sin editar/desactivar todavía [real]
                                # Catálogos + "Mi equipo": listados en el drawer solo si role === 'admin'
                                # (drawerItemStyle:{display:'none'} si no — ayuda de UX, no control de acceso:
                                # el server tampoco chequea rol en estas rutas todavía)
    open-workday.tsx           # /open-workday — elegir fruta/unidad (Menu), abre online + espeja local     [real]
    workday/[id]/
      anotador.tsx              # RF-02: roster + -1/+1/+2/+5 (o diálogo de peso si kgFactor=1), totales    [real]
      add-harvester.tsx          # buscar (caché local) o registrar uno nuevo (en vivo), agregar al roster (100% local) [real]
      close.tsx                   # revisar total y cerrar — bloqueado si algo sigue sin sincronizar (RF-01.2) [real]
    sync.tsx                    # pendientes + "Sincronizar Jornada" + resultado por ítem + indicador de red [real]
```

"Cerrar sesión" ya no es un botón en Home — es una acción directa en el `DrawerContent` custom de `(drawer)/_layout.tsx` (vía `DrawerItemList` + un `DrawerItem` agregado a mano), no una pantalla propia. Los grupos entre paréntesis (`(drawer)`, `(tabs)`, `(admin)`) nunca aparecen en la URL — mover archivos entre ellos no cambia ninguna ruta (`/home`, `/fruits`, etc. siguen iguales), así que los `router.push`/`router.replace` con paths literales en el resto de la app no necesitaron tocarse.

Todas las rutas existen y son recorribles desde el día uno (`components/PlaceholderScreen.tsx` cubre lo que todavía no tiene lógica real). El flujo completo — auth → onboarding → catálogos → abrir jornada → roster → Anotador → sync → cerrar — ya está construido y probado de punta a punta en un dispositivo físico vía Expo Go. Ver la sección siguiente para lo que falta.

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
  lib/          # helpers puros — firebase.ts, errors.ts, id.ts, y en el futuro chunking de sync, etc.
```

## Estado actual y próximos pasos

*(Última actualización: 2026-09-03. Esta sección es la que hay que leer primero al retomar el trabajo en una sesión nueva.)*

**Hecho y verificado en un dispositivo físico real (Expo Go):** el ciclo completo funciona de punta a punta — crear cuenta / iniciar sesión, onboarding (crear farm como admin o unirse con código como recorder), cargar catálogos (fruits/harvesters/measurement-units), abrir una jornada, armar el roster del día, anotar entregas (conteo de envases con -1/+1/+2/+5, o peso directo si la unidad tiene `kgFactor=1`), sincronizar lo pendiente, y cerrar la jornada (bloqueado si queda algo sin sincronizar). `server-app` corriendo local (`pnpm start:dev`) y `ui-app` apuntándole por la IP de LAN de la compu (ver `.env.example` — el error clásico si algo no conecta es que `EXPO_PUBLIC_API_URL` tenga `/api/v1` de más, o que sea `localhost` en vez de la IP real cuando se prueba desde el celular).

**Recién implementado y ya verificado en dispositivo físico (Expo Go, 2026-09-03):**
- El cacheo local de catálogos (`lib/catalogSync.ts`) — era el hueco más importante que quedaba en la promesa de "funciona sin señal". `add-harvester.tsx` y el Anotador leen fruits/harvesters/measurementUnits de SQLite en vez de pedirlos en vivo. **Confirmado en el celular**: agregar al roster a un cosechador que el catálogo ya conocía funciona en modo avión.
- `ui-app` subido de Expo SDK 54 a 57 (requerido: Expo Go en los celulares se había actualizado solo y ya no soportaba SDK 54). `react-native` 0.81→0.86, `react` 19.1→19.2, TypeScript 5.9→6.0 (hubo que sacar `baseUrl` de `tsconfig.json`, deprecado en TS 6). Sin cambios nativos (el proyecto no tiene carpetas `ios`/`android`).
- `/history` (`app/(app)/(drawer)/(tabs)/history.tsx`) — lista las jornadas cerradas de la farm (`GET /workdays?status=CLOSED`, en vivo, ya soportado por `server-app` sin cambios). El nombre de la fruta se resuelve contra la caché local de `fruits` en vez de otro pedido en vivo.
- Reorganización completa de la navegación: Tabs (Inicio/Historial) + Drawer (perfil, ajustes, catálogos y equipo solo-admin, cerrar sesión) — ver **Navegación (Expo Router)** más abajo y **Decisiones** para el porqué. Instaló `react-native-gesture-handler`/`react-native-reanimated`/`react-native-worklets` directos y `GestureHandlerRootView` en la raíz — los pide el Drawer. `/profile` es nuevo y placeholder (mismo patrón que `team.tsx`). Dos bugs reales encontrados probando en el celular, ya arreglados: (1) el ítem "(tabs)" empezó oculto de la lista del drawer, lo que dejaba sin forma de volver a Home desde Perfil/Ajustes/catálogos — ahora se lista como "Inicio"; (2) las pantallas con header nuevo (Tabs/Drawer, `headerShown:true`) quedaban con padding doble arriba porque `Screen` seguía protegiendo el borde superior con su propio `SafeAreaView` encima del header — `Screen` ahora acepta un prop `edges` (ver `components/Screen.tsx`), y las 8 pantallas bajo `(drawer)/` lo pasan como `['bottom','left','right']`.

**Recién implementado, todavía sin probar en dispositivo físico (2026-09-03):**
- Editar/desactivar catálogo (fruits/harvesters/measurement-units) — hasta ahora solo se podía crear. `server-app` suma `PATCH /:id` a los tres controllers, con un `update()` de partial-update por servicio: no filtra por `active` (a diferencia de `findActiveById`) así que también sirve para reactivar, y reusa el mismo manejo de nombre-duplicado que `create()` en fruits/measurement-units. `nickname` de harvester es el único campo opcional-editable — mandar `null` explícito lo borra (`$unset`, no `$set` con `undefined`, que Mongo descarta en silencio), mandar el campo omitido lo deja como estaba. En `ui-app`, las 3 pantallas de catálogo comparten un mismo diálogo para crear/editar (`editingId` null = crear) y un ícono de ojo por fila para el toggle activo/inactivo — sin diálogo de confirmación, porque es reversible y no afecta jornadas que ya referenciaban ese id (`findActiveById` solo se usa para referencias *nuevas*). Client regenerado (`pnpm generate:api`), tests nuevos por servicio en `server-app` (incluye el caso `$unset` del nickname).
- `team.tsx` dejó de ser stub: `GET /users` en `server-app` (solo admin) lista el equipo de la farm. Primer uso real de un chequeo de rol en el proyecto — `RolesGuard` (`src/auth/guards/roles.guard.ts`) + `@Roles('admin')`, en pareja con `FarmScopeGuard` (`@UseGuards(FarmScopeGuard, RolesGuard)`). `AuthModule`/`UsersModule` ahora se importan mutuamente vía `forwardRef()` (Auth necesita Users para el registro, Users ahora necesita los guards de Auth para su controller nuevo) — es el patrón sancionado por Nest para una dependencia genuina en dos sentidos, no un error a corregir. Alcance de `team.tsx` acotado a propósito a solo listar — ver la pregunta que quedó abierta más abajo sobre editar rol antes de construir eso.

**Recién implementado, camino feliz verificado pero sin probar el caso límite (2026-09-03):**
- La idempotencia de `POST /workdays` (mismo patrón `clientEntryId` + upsert que ya tienen `harvesterWorkday`/`harvestEntries`): `open-workday.tsx` genera el `clientEntryId` una sola vez por visita a la pantalla y lo reusa en cada reintento; `server-app` hace upsert por `{farmId, clientEntryId}`. El caso concreto que arregla (perder la respuesta justo después de que el server ya creó la jornada) es difícil de reproducir a mano con modo avión — la creación es demasiado rápida para alcanzar a cortar la señal a tiempo — así que quedó sin verificar en dispositivo. La lógica en sí ya está cubierta de forma determinística por los tests unitarios de `server-app` (incluye el caso de carrera entre dos reintentos concurrentes), así que el riesgo residual es bajo.

**Próximo gap grande, priorizado pero explícitamente pospuesto (definido con el usuario el 2026-09-03):** permitir registrar un harvester **nuevo** (no solo agregar uno que ya estaba en el catálogo) sin conexión. Hoy `handleQuickRegister` en `add-harvester.tsx` sigue llamando a `harvestersControllerCreate` en vivo. Es una pega bastante más grande que lo anterior, no un ajuste rápido:
- `harvesters` es hoy una caché puramente de solo lectura — no tiene columna `synced` ni ningún tracking de filas pendientes, a diferencia de `harvesterWorkday`/`harvestEntries`.
- Haría falta un harvester "pendiente" local con id propio del dispositivo, un endpoint `/harvesters/sync` idempotente en `server-app` (mismo patrón `clientEntryId`), y sincronizarlo en algún momento.
- El punto más delicado: si se agrega ese cosechador nuevo al roster de la jornada mientras sigue sin sincronizar, `harvesterWorkday`/`harvestEntries` quedan referenciando un `harvesterId` que todavía no existe en el server — hay que resolver ese reemplazo de id-local-por-id-real en cascada antes de subir el roster/las entregas.

**Recomendación de qué seguir, en orden de importancia real:**

1. Probar en dispositivo físico lo recién implementado (ver arriba): editar/desactivar catálogo (sobre todo borrar el apodo de un harvester) y `/team` (que un recorder no vea la pantalla ni pueda pegarle directo a `GET /users`).
2. Pulido, lo que queda: contenido real para Ajustes y Perfil (hoy placeholders, pero ya reachable desde el drawer).
3. El gap grande de arriba (registrar harvester nuevo offline) — priorizado pero pospuesto explícitamente hasta madurar si se necesita pronto.
4. Desplegar `server-app` a un hosting real (Railway o Render, ver [arquitectura.md §3](arquitectura.md)) — necesario para que la app funcione fuera de la red local del desarrollo, pero no urgente mientras se sigue construyendo/probando en local.
5. Verificar en dispositivo el caso límite de la idempotencia de `POST /workdays` (ver arriba) — bajo riesgo, sin apuro.

**Pregunta abierta (definida con el usuario el 2026-09-03):** `team.tsx` quedó deliberadamente acotado a solo listar el equipo. Activar/desactivar a un miembro y cambiar su rol (recorder ↔ admin) quedaron explícitamente afuera de este alcance — lo segundo tiene casos límite reales sin resolver (¿qué pasa si un admin se auto-degrada? ¿puede una farm quedar sin ningún admin?) que hay que pensar antes de construirlo, no durante.

**Decisión de producto pendiente de definir (no arquitectónica):** el usuario planteó que en uso real puede haber varias cuadrillas trabajando jornadas distintas en paralelo (cada una con su propio dispositivo/recorder — ya soportado, ver el fix de `createdByUid`), pero también casos donde más de una persona necesita anotar en la *misma* jornada desde dispositivos distintos. Eso último es una función bastante más grande (edición colaborativa multi-dispositivo, que choca con el diseño offline-first actual) y está explícitamente fuera de alcance en `modelo-datos.md` ("Whether several devices can share the same workday") — no se ha vuelto a discutir en profundidad, queda como pregunta abierta para cuando/si se necesite de verdad.

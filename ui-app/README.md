# ui-app

Cliente de terreno de [NovaFarm](../README.md): la aplicación con la que el anotador registra las entregas de la cuadrilla, en el campo y casi siempre sin señal.

**React Native + Expo (SDK 57) · TypeScript · SQLite (expo-sqlite + Drizzle) · React Query · React Native Paper · Zustand**

---

## Requisitos

- Node.js 22
- **pnpm** (fijado en `package.json`; no usar npm)
- La app **Expo Go** en un teléfono, o un emulador de Android / simulador de iOS
- [`server-app`](../server-app/README.md) corriendo y alcanzable desde el teléfono

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. El archivo `.env` está ignorado por git.

| Variable | Para qué |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL base del backend. **Sin `/api/v1` al final** — el cliente generado ya lo agrega. |
| `EXPO_PUBLIC_FIREBASE_API_KEY` y el resto de `EXPO_PUBLIC_FIREBASE_*` | Configuración del proyecto de Firebase: `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`. |
| `NOVAFARM_API_SPEC_URL` | Opcional. De dónde leer el OpenAPI al generar el cliente. Por defecto, `http://localhost:3000/api-docs-json`. |

Las `EXPO_PUBLIC_*` quedan dentro del bundle del cliente: es la convención de Expo y, en el caso de Firebase, esos valores identifican el proyecto pero no autorizan nada por sí solos. **Cualquier cosa que sí sea secreta no va acá**, va en el backend.

> **Si la app no conecta, mira primero el `EXPO_PUBLIC_API_URL`.** Desde un teléfono, `localhost` es el teléfono mismo: tiene que ser la IP del computador en la red local (`192.168.x.x`), y esa IP cambia al saltar entre el router y un hotspot.

## Levantarla

```bash
pnpm install
pnpm start          # abre el QR: escanéalo con Expo Go
```

O directo a un dispositivo o emulador:

```bash
pnpm android
pnpm ios
```

## Comandos

```bash
pnpm start              # servidor de desarrollo (Metro)
pnpm generate:api       # regenera el cliente tipado desde el OpenAPI del backend
pnpm db:generate        # regenera las migraciones de SQLite tras tocar db/schema.ts
```

- **`generate:api`** necesita el backend corriendo: lee su spec en vivo. Hay que correrlo después de cualquier cambio de DTO o de controlador allá; el resultado se commitea.
- **`db:generate`** hay que correrlo cada vez que cambia `db/schema.ts`. Las migraciones se aplican solas al abrir la app, antes de mostrar cualquier pantalla.

## Cómo está organizada

```
app/                    # rutas (expo-router, por sistema de archivos)
  (onboarding)/         # crear un campo o unirse con un código
  (app)/
    (drawer)/(tabs)/    # Inicio e Historial
    (drawer)/           # perfil, ajustes, catálogos, equipo
    workday/[id]/       # Anotador, agregar cosechador, cerrar jornada
    sync.tsx            # "Sincronizar Jornada"
api/generated/          # cliente tipado (generado por orval, se commitea)
db/                     # esquema y consultas de SQLite (Drizzle)
lib/                    # sincronización, pagos, pesajes, permisos, errores
stores/                 # estado global (Zustand)
components/  constants/  theme/
```

## Lo que define el diseño de esta app

**Offline-first, no como funcionalidad sino como restricción.** Abrir la jornada, registrar un cosechador nuevo y anotar entregas escriben primero en SQLite. Solo cerrar la jornada y sincronizar necesitan conexión. Sincronizar es un botón que el usuario aprieta, nunca algo automático: en terreno, gastar datos y batería a espaldas del usuario no es una comodidad.

**Anotar no espera a nadie.** El toque que registra una entrega solo escribe local y actualiza la pantalla al tiro. Es la acción más repetida del día y no puede depender de la red.

**La interfaz está hecha para el campo.** Botones grandes usables con una mano y con guantes, alto contraste para sol directo, y las palabras que se usan en terreno: "Anotar", "Tarro", "Vuelta". Los identificadores del código son en inglés; lo que se lee en pantalla, en español. Una entidad se llama `products` en el código y "Cultivo" en la pantalla, a propósito.

**La sincronización sube en cuatro etapas, en orden:** jornada → cosechadores → lista del día → entregas. Cada etapa necesita los identificadores que produce la anterior. Está todo en un solo lugar (`app/(app)/sync.tsx` y `lib/*Sync.ts`) y deja una traza por etapa en la consola de desarrollo, que es lo que permite reconstruir dónde se cortó una sincronización que alguien reporta desde el campo.

**Los errores se muestran en un aviso flotante**, traducidos desde el código que manda el backend (`lib/errors.ts`), nunca desde su texto en inglés.

## Dos detalles de configuración que no hay que borrar

- **`.npmrc` con `node-linker=hoisted`**: Metro no resuelve bien el `node_modules` anidado de pnpm sin esto.
- **`babel.config.js` y `metro.config.js`** tienen ajustes para que las migraciones `.sql` de Drizzle entren al bundle como texto en vez de intentar interpretarse como código.

## Una advertencia sobre las versiones

Expo cambia rápido y entre versiones mayores se rompen cosas. Antes de escribir código específico de Expo, revisa la documentación **de la versión exacta** que usa el proyecto (mira `expo` en `package.json`): https://docs.expo.dev/versions/v57.0.0/

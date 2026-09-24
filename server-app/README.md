# server-app

Backend de [NovaFarm](../README.md): recibe lo que las cuadrillas capturan en terreno, lo persiste y lo devuelve para el historial y los informes.

**NestJS 11 · TypeScript · MongoDB Atlas (Mongoose) · Firebase Admin · OpenAPI**

Es un **monolito modular**: un solo desplegable con módulos que se hablan por inyección de dependencias, no microservicios. El porqué está en [arquitectura.md §1](../docs/diagrams/arquitectura.md).

---

## Requisitos

- Node.js 22 (es la versión con la que se construye la imagen de Docker)
- **pnpm** (fijado en `package.json`; no usar npm — el lockfile es `pnpm-lock.yaml`)
- Una MongoDB alcanzable: Atlas, o la local que levanta `docker compose`
- Un proyecto de Firebase con una cuenta de servicio (para verificar los tokens de la app)

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. El archivo `.env` está ignorado por git.

| Variable | Para qué |
|---|---|
| `MONGODB_URI_ATLAS` | Cadena de conexión a MongoDB. **Sin esto el server no termina de arrancar.** |
| `FIREBASE_PROJECT_ID` | Proyecto de Firebase contra el que se validan los tokens. |
| `FIREBASE_CLIENT_EMAIL` | Correo de la cuenta de servicio. |
| `FIREBASE_PRIVATE_KEY` | Clave privada de esa cuenta, **con los saltos de línea escapados** (`\n` literales): el código los des-escapa al leerla. |
| `PORT` | Puerto HTTP. Por defecto `3000`. |
| `NODE_ENV` | En `production` no se monta Swagger. |

## Levantarlo

**Con tu propia MongoDB** (Atlas o una local ya corriendo):

```bash
pnpm install
pnpm start:dev          # recarga en caliente
```

**Con Docker**, que levanta el server y una MongoDB local en un solo paso:

```bash
docker compose up
```

Esto usa la etapa `dev` del `Dockerfile` (con el código montado y recarga en caliente) y apunta **siempre** a la Mongo del contenedor, sin importar lo que diga tu `.env` — nunca toca un Atlas real.

El `Dockerfile` también tiene una etapa `runtime`, que es la imagen de producción: multi-stage, sin dependencias de desarrollo y con usuario sin privilegios.

> **Si se queda pegado al arrancar, es la base de datos.** El módulo de Mongoose bloquea el arranque hasta conectarse; no hay timeout amable que lo avise.

## Comandos

```bash
pnpm start:dev          # desarrollo con watch
pnpm build              # compila a dist/
pnpm start:prod         # corre lo compilado
pnpm lint               # eslint --fix
pnpm test               # tests unitarios (jest)
pnpm test -- <ruta>     # un archivo de tests
pnpm test:e2e           # tests e2e
```

## La API

Con el server corriendo y `NODE_ENV` distinto de `production`:

- **Swagger UI** → http://localhost:3000/api-docs
- **Spec OpenAPI** → http://localhost:3000/api-docs-json (es lo que consume el generador de cliente de `ui-app`)

Todas las rutas van bajo **`/api/v1`**, excepto `/health`, que queda sin prefijo a propósito: es un chequeo de infraestructura, no parte del contrato versionado.

| Grupo | Rutas |
|---|---|
| `auth` | Registro de administrador y de anotador (el login lo hace la app directo contra Firebase; acá nunca pasa una contraseña). |
| `farms` | El campo propio y su código de invitación. |
| `users` | Equipo del campo, perfil propio, asignación de roles. |
| `products`, `measurement-units`, `harvesters` | Catálogos: listar, crear, editar, activar y desactivar. |
| `workdays` | Abrir, listar, fijar la tarifa y cerrar jornadas. |
| `harvesters/sync`, `harvester-workday/sync`, `harvest-entries/sync` | Subida de lo capturado sin conexión. |
| `health` | Chequeo para el hosting. |

## Cómo está organizado

```
src/
  auth/                 # Firebase Admin, guards y decoradores de identidad
  farms/                # el inquilino (tenant)
  users/  harvesters/  products/  measurement-units/
  workdays/  harvester-workday/  harvest-entries/
  common/
    errors/             # AppException, códigos de error y filtro global
    logging/            # trazas de las sincronizaciones
    context/            # correlación de peticiones (AsyncLocalStorage)
  health/
```

Cada módulo sigue la misma forma: `schemas/`, `dto/` separados por dirección (`request/`, `response/`), servicio, controlador y sus tests. `src/farms/` es la referencia a copiar al agregar uno nuevo.

## Tres cosas que conviene saber antes de tocar el código

**1. Aislamiento entre campos, sin excepciones.** Cada colección lleva `farmId` y toda consulta filtra por él **directamente**. Nunca deducirlo pasando por otra colección: hay caminos donde ese campo es nulo y la consulta terminaría devolviendo datos de otro cliente. La identidad la aporta Firebase, y `FarmScopeGuard` la traduce al `farmId` de cada petición.

**2. Los errores viajan con un código estable, no con su texto.** Cada error de negocio lanza una `AppException` con un código (`src/common/errors/error-codes.ts`), y un filtro global se lo agrega también a todo lo demás — validación, límite de peticiones, rutas inexistentes, errores no previstos. El mensaje en inglés es para el log; **el contrato es el código**, y es lo que la app usa para elegir qué mostrarle al usuario en español. Los tests verifican el código, no la clase de excepción.

**3. Las sincronizaciones son idempotentes.** Cada fila que sube la app trae un identificador generado en el teléfono; el servidor inserta o actualiza sobre él, así que reintentar después de una respuesta perdida no duplica nada. Un lote responde siempre 200, con el resultado de cada fila por separado: creada, ya estaba, o rechazada con su motivo.

## Después de cambiar un DTO o un controlador

Vuelve a generar el cliente tipado de la app, o quedará desalineado:

```bash
cd ../ui-app && pnpm generate:api      # necesita este server corriendo
```

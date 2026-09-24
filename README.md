# NovaFarm

**Reemplaza el cuaderno con el que se lleva la cosecha de fruta en terreno.**

En un packing la cuenta se lleva a mano: el anotador marca rayas en una hoja cada vez que un cosechador entrega un tarro, y al final del día alguien suma todo y calcula cuánto le toca a cada uno. Se pierden hojas, se moja el papel, se cuenta dos veces y se discute el total.

NovaFarm hace esa misma pega en el celular, **sin necesitar señal**: en el campo casi nunca hay.

---

## Qué hace

- **Anotar entregas en un toque.** Botones grandes de +1, +2, +5 y -1 que se mantienen apretados 0,4 segundos antes de registrar, con vibración, un salto del total y "Deshacer" por si fue un error. Se pensó así porque en terreno, con guantes y sol directo, un toque accidental le suma kilos a la persona equivocada.
- **Dos formas de medir.** Contando envases de peso fijo (un tarro de 10 kg) o pesando cada envase en una romana. La conversión a kilos es dato, nunca código: agregar una fruta o un tipo de envase no requiere tocar el sistema.
- **Funciona sin señal.** Abrir la jornada, registrar cosechadores nuevos y anotar entregas escriben primero en la base local del teléfono. Sincronizar es un botón aparte, explícito, que el anotador aprieta cuando tiene conexión.
- **Pago del día.** Tarifa por envase o por kilo, con el cálculo por persona y el total de la jornada, exportable a PDF para entregarlo en papel.
- **Varias cuentas por campo.** Administrador, supervisor y anotador, con un código de invitación que vence en una hora.
- **Catálogos propios.** Cada campo define sus cultivos, sus unidades de medida y su lista de cosechadores.

<!-- Capturas: van acá, después de la pasada de diseño (Anotador, Inicio,
     Sincronizar, Cerrar Jornada). -->

## Cómo está hecho

Dos aplicaciones independientes, sin monorepo:

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  ui-app                 │        │  server-app              │
│  React Native + Expo    │──────▶│  NestJS                   │
│                         │  HTTPS │                          │
│  SQLite (expo-sqlite)   │  REST  │  MongoDB Atlas           │
│  captura local          │        │  (Mongoose)              │
└─────────────────────────┘        └──────────────────────────┘
            │                                   │
            └──────────── Firebase Auth ────────┘
                    (identidad delegada)
```

| | |
|---|---|
| **[`ui-app/`](ui-app/)** | Cliente de terreno. React Native + Expo (SDK 57), TypeScript, SQLite con Drizzle ORM, React Query, React Native Paper, Zustand. |
| **[`server-app/`](server-app/)** | Backend. NestJS 11, TypeScript, MongoDB Atlas con Mongoose, validación por DTO con class-validator, OpenAPI/Swagger. |

El cliente tipado de la API **se genera** desde el OpenAPI del backend con orval, así que un cambio de contrato en el server rompe la compilación de la app en vez de fallar en producción.

### Las decisiones que explican el resto

- **Offline-first no es una funcionalidad, es la restricción.** Toda la captura de una jornada escribe primero en SQLite. La sincronización es una acción separada y explícita del usuario, nunca automática: automatizarla gastaría datos y batería justo donde escasean.
- **Anotar no puede esperar a nadie.** El toque que registra una entrega solo toca la base local, nunca la red. Es la acción más repetida del día, cientos de veces por jornada.
- **Aislamiento entre campos.** Cada colección lleva su `farmId` y toda consulta filtra por él directamente, nunca a través de un join — un filtro olvidado no es un bug, es una fuga de datos de otro cliente.
- **Todo configurable en caliente.** Frutas, envases y sus factores de conversión son documentos en la base. Sumar un tipo de envase nuevo no requiere un despliegue.
- **Código en inglés, interfaz en español.** Los identificadores son en inglés; lo que el cosechador lee usa las palabras que se usan en terreno ("Anotar", "Tarro", "Vuelta"), no términos técnicos traducidos.
- **La sincronización asume que las cosas fallan.** Sube en cuatro etapas ordenadas, cada fila lleva un identificador generado en el teléfono para que un reintento no duplique nada, y el servidor responde fila por fila: creada, ya estaba, o rechazada y por qué.

---

## Cómo correrlo

Cada aplicación tiene sus instrucciones, que es donde están los detalles que importan:

- **[`server-app/README.md`](server-app/README.md)** — necesita una MongoDB alcanzable antes de arrancar (hay un `docker compose` que levanta una local).
- **[`ui-app/README.md`](ui-app/README.md)** — se abre con Expo Go escaneando el QR; el backend tiene que estar corriendo primero.

Ambas usan **pnpm** (no npm), fijado en cada `package.json`.

---

## Estado actual

El ciclo completo funciona de punta a punta y está probado en un dispositivo físico: crear cuenta → crear o unirse a un campo → cargar catálogos → abrir jornada → armar la lista del día → anotar entregas → sincronizar → cerrar la jornada. Toda la mitad de captura funciona en modo avión.

Lo que falta:

- **No está desplegado.** El backend corre localmente; no hay hosting ni CI configurados todavía.
- Sin cobertura de tests en `ui-app` (el backend sí tiene, 179 unitarios).
- Sin imágenes para los cultivos (hoy se identifican con un emoji).

---

## Documentación

- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — requisitos funcionales y no funcionales.
- [`docs/diagrams/arquitectura.md`](docs/diagrams/arquitectura.md) — decisiones de arquitectura del backend y del contrato entre las dos aplicaciones.
- [`docs/diagrams/ui-arquitectura.md`](docs/diagrams/ui-arquitectura.md) — decisiones del cliente: navegación, persistencia local, estado, temas.
- [`docs/diagrams/modelo-datos.md`](docs/diagrams/modelo-datos.md) — el modelo de datos y por qué está así.

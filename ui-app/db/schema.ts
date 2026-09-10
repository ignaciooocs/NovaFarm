import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Espeja el modelo de Mongo de server-app (mismos nombres de campo en
// inglés, misma convención de código-en-inglés/copy-en-español del proyecto).
// Los catálogos son caché local de solo lectura, refrescada desde el server
// cuando hay conexión — nunca se editan localmente.

// Los cultivos que esta farm cosecha. `id` es el `_id` del producto en el
// server, que es **global** — la misma "Palta" para todas las farms (ver
// product.schema.ts en server-app). `farmId` no viene de ese producto sino
// de la sesión: es de qué farm es esta caché, y lo único que usa es la purga
// cruzada de syncCatalogs() (si el dispositivo se usó antes con otra cuenta).
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  name: text('name').notNull(),
  // Nullable porque una fila sincronizada antes de que este campo existiera
  // no tiene por qué backfillearse a mano, se completa sola en el próximo
  // syncCatalogs(). Las pantallas que lo muestran caen a un emoji genérico.
  icon: text('icon'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

// `synced` es lo único que rompe la regla de "caché de solo lectura" del
// comentario de arriba: un cosechador registrado en el campo sin conexión
// (add-harvester.tsx) se inserta acá con `id` local y `synced: false` antes
// de existir en el server — default `true` porque todo lo que ya llega vía
// syncCatalogs() (con `_id` real del server) está sincronizado por
// definición. Ver lib/harvesterSync.ts para cómo se resuelve: al subirlo,
// `id` se reescribe en cascada por el `_id` real en esta fila y en toda
// referencia (harvester_workday.harvester_id, harvest_entries.harvester_id).
export const harvesters = sqliteTable('harvesters', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nickname: text('nickname'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(true),
});

// `mode` dice cómo se anota una entrega hecha con esta unidad, y es lo que
// decide qué muestra el Anotador. Antes no existía y se deducía de
// `kgFactor === 1`, lo que obligaba a inventar unidades falsas ("capacho
// 1kg") y hacía que harvest_entries.unit_count significara kilos en vez de
// envases para esas — una vuelta de 22,1 kg quedaba como "22,1 capachos".
//   COUNT  — envase de peso fijo (tarro 20kg): se cuentan envases con los
//            botones +1/+2/+5 y los kilos salen de kg_factor.
//   WEIGHT — envase que se pesa en cada vuelta (capacho): cada anotación es
//            1 envase y los kilos los pone la romana, sin kg_factor.
// `kgFactor` es nullable por lo mismo: en WEIGHT no hay factor que guardar.
export const measurementUnits = sqliteTable('measurement_units', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  name: text('name').notNull(),
  mode: text('mode', { enum: ['COUNT', 'WEIGHT'] })
    .notNull()
    .default('COUNT'),
  kgFactor: real('kg_factor'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

// La jornada abierta en el dispositivo. `id` se genera localmente al entrar
// a la pantalla de abrir jornada (open-workday.tsx) y también se manda al
// server como `clientEntryId` en el POST /workdays — igual que
// harvesterWorkday/harvestEntries, esto hace que reintentar sea idempotente:
// si el dispositivo pierde conexión justo después de que el server crea la
// jornada pero antes de recibir la respuesta, un reintento con el mismo
// `clientEntryId` vuelve a traer la misma jornada en vez de duplicarla.
// `serverId` se completa una vez que esa respuesta llega con éxito.
export const workdays = sqliteTable('workdays', {
  id: text('id').primaryKey(),
  serverId: text('server_id'),
  farmId: text('farm_id').notNull(),
  date: text('date').notNull(), // fecha ISO
  productId: text('product_id').notNull(),
  defaultMeasurementUnitId: text('default_measurement_unit_id').notNull(),
  status: text('status', { enum: ['OPEN', 'CLOSED'] })
    .notNull()
    .default('OPEN'),
  finalTotalKg: real('final_total_kg'),
  // Cuánto se le paga al cosechador por lo que entrega en esta jornada, y
  // sobre qué se calcula (espeja workday.schema.ts del server). Los dos
  // nullables porque la tarifa es **opcional**: hay farms que pagan por día
  // y no a trato, y en terreno el precio muchas veces todavía no está
  // definido a la hora de abrir la jornada — exigirlo bloquearía la
  // captura, que es lo único que no puede fallar. Sin tarifa, ninguna
  // pantalla ni el PDF muestran plata (que no es lo mismo que mostrar $0).
  //   PER_UNIT — $ por envase entregado; solo con unidades COUNT.
  //   PER_KG   — $ por kilo; el único modo posible si el envase se pesa en
  //              cada vuelta, donde pagar por envase sería pagar por viaje.
  // Entero y no real: son pesos chilenos, sin centavos.
  payRate: integer('pay_rate'),
  payBasis: text('pay_basis', { enum: ['PER_UNIT', 'PER_KG'] }),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  // uid de Firebase de quien abrió la jornada en este dispositivo — sin
  // esto, "la jornada activa" era global al dispositivo, no por cuenta: si
  // dos cuentas distintas (dos recorders de dos cuadrillas) usaban el mismo
  // celular para probar, la segunda cuenta veía la jornada de la primera.
  createdByUid: text('created_by_uid').notNull().default(''),
});

// El roster del día. `workdayNumber` se calcula 100% local (máximo actual +
// 1), sin coordinación con el server (ver modelo-datos.md). `id` hace de
// clientEntryId: es el mismo valor que se manda a POST
// /harvester-workday/sync para que los reintentos sean idempotentes.
export const harvesterWorkday = sqliteTable('harvester_workday', {
  id: text('id').primaryKey(),
  workdayId: text('workday_id').notNull(),
  harvesterId: text('harvester_id').notNull(),
  workdayNumber: integer('workday_number').notNull(),
  addedAt: text('added_at').notNull(),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
});

// Cada "Anotar" — el equivalente digital de una raya en el cuaderno. `id`
// hace de clientEntryId, igual que en harvesterWorkday.
//
// `unitCount` son SIEMPRE envases, nunca kilos, sea cual sea el modo de la
// unidad (ver measurementUnits.mode): en COUNT es cuántos tarros trajo, en
// WEIGHT es 1 (un capacho pesado), y negativo en ambos casos si es una
// corrección. Los kilos viven solo en `totalKg`.
export const harvestEntries = sqliteTable('harvest_entries', {
  id: text('id').primaryKey(),
  workdayId: text('workday_id').notNull(),
  harvesterId: text('harvester_id').notNull(),
  measurementUnitId: text('measurement_unit_id').notNull(),
  unitCount: real('unit_count').notNull(),
  totalKg: real('total_kg').notNull(),
  // Pesaje de control, opcional y solo en unidades COUNT: el envase vale
  // 3,0 kg por catálogo y alguien dejó anotado que esa vuelta trajo 3,4.
  // Es un dato aparte para comparar (merma, envases mal llenados, cuadrar
  // con el packing) — **nunca** entra en totalKg ni en el pago. Ver
  // lib/weighing.ts.
  measuredKg: real('measured_kg'),
  recordedAt: text('recorded_at').notNull(),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
});

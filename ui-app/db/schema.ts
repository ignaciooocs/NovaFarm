import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Espeja el modelo de Mongo de server-app (mismos nombres de campo en
// inglés, misma convención de código-en-inglés/copy-en-español del proyecto).
// Los catálogos son caché local de solo lectura, refrescada desde el server
// cuando hay conexión — nunca se editan localmente.

export const fruits = sqliteTable('fruits', {
  id: text('id').primaryKey(), // = _id del server
  farmId: text('farm_id').notNull(),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const harvesters = sqliteTable('harvesters', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nickname: text('nickname'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const measurementUnits = sqliteTable('measurement_units', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull(),
  name: text('name').notNull(),
  kgFactor: real('kg_factor').notNull(),
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
  fruitId: text('fruit_id').notNull(),
  defaultMeasurementUnitId: text('default_measurement_unit_id').notNull(),
  status: text('status', { enum: ['OPEN', 'CLOSED'] })
    .notNull()
    .default('OPEN'),
  finalTotalKg: real('final_total_kg'),
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
export const harvestEntries = sqliteTable('harvest_entries', {
  id: text('id').primaryKey(),
  workdayId: text('workday_id').notNull(),
  harvesterId: text('harvester_id').notNull(),
  measurementUnitId: text('measurement_unit_id').notNull(),
  unitCount: real('unit_count').notNull(),
  totalKg: real('total_kg').notNull(),
  recordedAt: text('recorded_at').notNull(),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
});

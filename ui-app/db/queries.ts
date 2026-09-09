import { and, eq } from 'drizzle-orm';
import { db } from './client';
import {
  products,
  harvesters,
  harvestEntries,
  harvesterWorkday,
  measurementUnits,
  workdays,
} from './schema';

// Se asume un dispositivo trabajando una jornada a la vez, pero **por
// cuenta** — sin el filtro por uid, la jornada activa era global al
// dispositivo, no por usuario: si dos cuentas distintas (dos recorders de
// dos cuadrillas) probaban en el mismo celular, la segunda cuenta veía la
// jornada que abrió la primera. La usan Home (para mostrar la jornada
// activa) y open-workday (para no dejar abrir una segunda encima de la que
// ya está abierta).
export async function getActiveWorkday(uid: string) {
  const [row] = await db
    .select()
    .from(workdays)
    .where(and(eq(workdays.status, 'OPEN'), eq(workdays.createdByUid, uid)))
    .limit(1);
  return row ?? null;
}

// Chequeo previo a limpiar la base local al cerrar sesión (ver
// clearLocalData) — global al dispositivo, no por cuenta: si hay algo sin
// sincronizar de *cualquier* cuenta que haya usado este celular, no hay que
// dejar cerrar sesión igual, porque limpiar la base ahí perdería una
// entrega de cosecha real sin que nadie pueda volver a sincronizarla
// después (ni siquiera esa misma cuenta, si ya no tiene sesión). Mismo
// criterio que ya usa el cierre de jornada (RF-01.2): bloquear, no solo
// avisar.
export async function hasUnsyncedData(): Promise<boolean> {
  const [pendingWorkday] = await db
    .select({ id: workdays.id })
    .from(workdays)
    .where(eq(workdays.synced, false))
    .limit(1);
  if (pendingWorkday) {
    return true;
  }

  const [pendingRoster] = await db
    .select({ id: harvesterWorkday.id })
    .from(harvesterWorkday)
    .where(eq(harvesterWorkday.synced, false))
    .limit(1);
  if (pendingRoster) {
    return true;
  }

  const [pendingEntry] = await db
    .select({ id: harvestEntries.id })
    .from(harvestEntries)
    .where(eq(harvestEntries.synced, false))
    .limit(1);
  if (pendingEntry) {
    return true;
  }

  // Un cosechador registrado offline (add-harvester.tsx) sin sincronizar
  // todavía no existe en el server en absoluto — a diferencia de una
  // jornada abierta-pero-sincronizada (que getActiveWorkdayWithRecovery()
  // puede reconstruir), acá no hay ninguna copia que recuperar si
  // clearLocalData() lo borra.
  const [pendingHarvester] = await db
    .select({ id: harvesters.id })
    .from(harvesters)
    .where(eq(harvesters.synced, false))
    .limit(1);
  return Boolean(pendingHarvester);
}

// Vacía toda la base local (jornadas/roster/entregas capturadas + catálogos
// cacheados) — se llama al cerrar sesión, siempre que hasUnsyncedData()
// haya confirmado que no hay nada que perder. Sin esto, la base local
// crecía para siempre (nada la limpiaba nunca, ni al cambiar de cuenta ni
// al cambiar de farm) y quedaba data huérfana de una cuenta/farm que ya no
// existe en el server. Los catálogos son puro caché (se vuelven a traer
// solteros en el próximo syncCatalogs()), así que no hay riesgo en
// borrarlos también, no solo las tablas de captura. Borrar una jornada
// ABIERTA acá tampoco es definitivo — si sigue abierta en el server,
// getActiveWorkdayWithRecovery() (lib/recoverActiveWorkday.ts) la
// reconstruye sola la próxima vez que la misma cuenta vuelva a entrar.
export async function clearLocalData(): Promise<void> {
  await db.transaction((tx) => {
    tx.delete(harvestEntries).run();
    tx.delete(harvesterWorkday).run();
    tx.delete(workdays).run();
    tx.delete(products).run();
    tx.delete(harvesters).run();
    tx.delete(measurementUnits).run();
  });
}

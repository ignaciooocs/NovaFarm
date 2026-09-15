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

// Solo para diagnóstico (log de "cerrar sesión bloqueado", bajo __DEV__):
// hasUnsyncedData() dice *si* hay algo, esto dice *qué* y *de qué jornada*.
// Hace falta porque los dos chequeos no miran lo mismo: Cerrar Jornada solo
// cuenta lo pendiente de esa jornada, y cerrar sesión cuenta todo el
// dispositivo — cualquier jornada, de cualquier cuenta, más los cosechadores
// registrados offline. "Cerré la jornada y no me deja cerrar sesión" casi
// siempre es otra jornada o un cosechador, y sin esto no hay cómo verlo.
// Una línea, ids cortos y conteos; nada de nombres (datos personales).
export async function describeUnsyncedData(): Promise<string> {
  const [allWorkdays, pendingRoster, pendingEntries, pendingHarvesters] =
    await Promise.all([
      db
        .select({
          id: workdays.id,
          serverId: workdays.serverId,
          status: workdays.status,
          date: workdays.date,
          synced: workdays.synced,
        })
        .from(workdays),
      db
        .select({ workdayId: harvesterWorkday.workdayId })
        .from(harvesterWorkday)
        .where(eq(harvesterWorkday.synced, false)),
      db
        .select({ workdayId: harvestEntries.workdayId })
        .from(harvestEntries)
        .where(eq(harvestEntries.synced, false)),
      db
        .select({ id: harvesters.id })
        .from(harvesters)
        .where(eq(harvesters.synced, false)),
    ]);

  const byWorkday = new Map<
    string,
    { workday: boolean; roster: number; entries: number }
  >();
  const bucket = (workdayId: string) => {
    const current = byWorkday.get(workdayId) ?? {
      workday: false,
      roster: 0,
      entries: 0,
    };
    byWorkday.set(workdayId, current);
    return current;
  };
  allWorkdays
    .filter((workday) => !workday.synced)
    .forEach((workday) => {
      bucket(workday.id).workday = true;
    });
  pendingRoster.forEach((row) => {
    bucket(row.workdayId).roster += 1;
  });
  pendingEntries.forEach((row) => {
    bucket(row.workdayId).entries += 1;
  });

  const workdaysById = new Map(allWorkdays.map((w) => [w.id, w]));
  const parts = [...byWorkday.entries()].map(([workdayId, pending]) => {
    const workday = workdaysById.get(workdayId);
    // Una fila pendiente cuya jornada ya no existe localmente es un
    // hallazgo en sí: nada la va a poder subir nunca.
    const label = workday
      ? `${workday.status} ${workday.date.slice(0, 10)}, ${workday.serverId ? 'en server' : 'sin server'}`
      : 'jornada no existe local';
    const what = [
      pending.workday ? 'la jornada' : null,
      pending.roster ? `${pending.roster} roster` : null,
      pending.entries ? `${pending.entries} entregas` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return `jornada ${workdayId.slice(0, 6)} (${label}): ${what}`;
  });
  if (pendingHarvesters.length > 0) {
    parts.push(`${pendingHarvesters.length} cosechadores sin subir`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'nada pendiente';
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

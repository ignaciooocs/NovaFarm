import { and, eq, notInArray } from 'drizzle-orm';
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
//
// Una jornada marcada como "ya no se va a subir" (syncSkipped) tampoco
// cuenta como activa: si el server no la tiene o ya la cerró, seguir
// anotando en ella sería anotar en el vacío — y así abrir una nueva deja de
// estar bloqueado por una jornada muerta.
export async function getActiveWorkday(uid: string) {
  const [row] = await db
    .select()
    .from(workdays)
    .where(
      and(
        eq(workdays.status, 'OPEN'),
        eq(workdays.createdByUid, uid),
        eq(workdays.syncSkipped, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Las jornadas que el usuario dio por perdidas. Se usa para descontar sus
// filas de los conteos de pendientes (no hay join en estas consultas: el
// roster y las entregas guardan workdayId, no la jornada entera).
async function readSkippedWorkdayIds(): Promise<string[]> {
  const rows = await db
    .select({ id: workdays.id })
    .from(workdays)
    .where(eq(workdays.syncSkipped, true));
  return rows.map((row) => row.id);
}

// Chequeo previo a limpiar la base local al cerrar sesión (ver
// clearLocalData) — global al dispositivo, no por cuenta: si hay algo sin
// sincronizar de *cualquier* cuenta que haya usado este celular, no hay que
// dejar cerrar sesión igual, porque limpiar la base ahí perdería una
// entrega de cosecha real sin que nadie pueda volver a sincronizarla
// después (ni siquiera esa misma cuenta, si ya no tiene sesión). Mismo
// criterio que ya usa el cierre de jornada (RF-01.2): bloquear, no solo
// avisar.
//
// Lo que el usuario marcó como "ya no se va a subir" (workdays.syncSkipped,
// desde el historial local) no cuenta: el server lo rechaza para siempre, y
// sin esta salida esas filas bloquean cerrar sesión hasta borrar los datos
// de la app. Sigue todo guardado y visible en el historial local.
export async function hasUnsyncedData(): Promise<boolean> {
  const skippedWorkdayIds = await readSkippedWorkdayIds();

  const [pendingWorkday] = await db
    .select({ id: workdays.id })
    .from(workdays)
    .where(and(eq(workdays.synced, false), eq(workdays.syncSkipped, false)))
    .limit(1);
  if (pendingWorkday) {
    return true;
  }

  const [pendingRoster] = await db
    .select({ id: harvesterWorkday.id })
    .from(harvesterWorkday)
    .where(
      and(
        eq(harvesterWorkday.synced, false),
        notInArray(harvesterWorkday.workdayId, skippedWorkdayIds),
      ),
    )
    .limit(1);
  if (pendingRoster) {
    return true;
  }

  const [pendingEntry] = await db
    .select({ id: harvestEntries.id })
    .from(harvestEntries)
    .where(
      and(
        eq(harvestEntries.synced, false),
        notInArray(harvestEntries.workdayId, skippedWorkdayIds),
      ),
    )
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
  // Las mismas exclusiones que hasUnsyncedData(), o el log diría que hay
  // pendientes cuando cerrar sesión ya no está bloqueado.
  const skippedWorkdayIds = await readSkippedWorkdayIds();
  const [allWorkdays, pendingRoster, pendingEntries, pendingHarvesters] =
    await Promise.all([
      db
        .select({
          id: workdays.id,
          serverId: workdays.serverId,
          status: workdays.status,
          date: workdays.date,
          synced: workdays.synced,
          syncSkipped: workdays.syncSkipped,
        })
        .from(workdays),
      db
        .select({ workdayId: harvesterWorkday.workdayId })
        .from(harvesterWorkday)
        .where(
          and(
            eq(harvesterWorkday.synced, false),
            notInArray(harvesterWorkday.workdayId, skippedWorkdayIds),
          ),
        ),
      db
        .select({ workdayId: harvestEntries.workdayId })
        .from(harvestEntries)
        .where(
          and(
            eq(harvestEntries.synced, false),
            notInArray(harvestEntries.workdayId, skippedWorkdayIds),
          ),
        ),
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
    .filter((workday) => !workday.synced && !workday.syncSkipped)
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

// Lo que este dispositivo guardó de cada jornada, esté subida o no. Es el
// historial local (pedido del usuario, 2026-09-20): la base local conserva
// todo hasta cerrar sesión, pero hasta ahora no había forma de verlo desde
// el celular — cuando algo quedaba rechazado por el server, el anotador no
// tenía cómo saber qué tenía él y qué tenía el server.
//
// Agrega en JS y no en SQL, igual que el Anotador y Cerrar Jornada: son
// tablas chicas y así son tres consultas en vez de una por jornada.
export interface LocalWorkdaySummary {
  id: string;
  serverId: string | null;
  date: string;
  productId: string;
  status: 'OPEN' | 'CLOSED';
  // La jornada misma cuenta como pendiente si se abrió sin conexión y
  // todavía no subió (mismo criterio que Cerrar Jornada).
  synced: boolean;
  // El usuario la dio por perdida: lo suyo ya no cuenta como pendiente.
  syncSkipped: boolean;
  totalKg: number;
  entryCount: number;
  pendingEntries: number;
  rosterCount: number;
  pendingRoster: number;
}

export async function readLocalWorkdays(): Promise<LocalWorkdaySummary[]> {
  const [workdayRows, entryRows, rosterRows] = await Promise.all([
    db.select().from(workdays),
    db
      .select({
        workdayId: harvestEntries.workdayId,
        totalKg: harvestEntries.totalKg,
        synced: harvestEntries.synced,
      })
      .from(harvestEntries),
    db
      .select({
        workdayId: harvesterWorkday.workdayId,
        synced: harvesterWorkday.synced,
      })
      .from(harvesterWorkday),
  ]);

  const summaries = new Map<string, LocalWorkdaySummary>(
    workdayRows.map((row) => [
      row.id,
      {
        id: row.id,
        serverId: row.serverId,
        date: row.date,
        productId: row.productId,
        status: row.status,
        synced: row.synced,
        syncSkipped: row.syncSkipped,
        totalKg: 0,
        entryCount: 0,
        pendingEntries: 0,
        rosterCount: 0,
        pendingRoster: 0,
      },
    ]),
  );

  entryRows.forEach((entry) => {
    const summary = summaries.get(entry.workdayId);
    if (!summary) {
      return;
    }
    summary.totalKg += entry.totalKg;
    summary.entryCount += 1;
    if (!entry.synced) {
      summary.pendingEntries += 1;
    }
  });

  rosterRows.forEach((roster) => {
    const summary = summaries.get(roster.workdayId);
    if (!summary) {
      return;
    }
    summary.rosterCount += 1;
    if (!roster.synced) {
      summary.pendingRoster += 1;
    }
  });

  // La más reciente arriba, igual que el Historial del server.
  return [...summaries.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// Una sola jornada local, para el detalle del historial local. Reusa la
// lectura completa en vez de una consulta aparte: son tablas chicas y así
// los dos lugares muestran exactamente lo mismo.
export async function readLocalWorkday(
  id: string,
): Promise<LocalWorkdaySummary | null> {
  const all = await readLocalWorkdays();
  return all.find((workday) => workday.id === id) ?? null;
}

// Deja la jornada local igual que en el server cuando allá ya está cerrada
// y acá no (la respuesta del cierre se perdió). No toca `synced` ni las
// entregas: solo copia el estado y el total congelado que el server ya
// calculó, que es el que vale.
export async function markLocalWorkdayClosed(
  id: string,
  finalTotalKg: number | null,
): Promise<void> {
  await db
    .update(workdays)
    .set({ status: 'CLOSED', finalTotalKg })
    .where(eq(workdays.id, id));
}

// Marca (o desmarca) una jornada como "ya no se va a subir". No borra nada:
// la jornada y todo lo suyo se siguen viendo en el historial local, solo
// dejan de contar como pendientes y de bloquear cerrar sesión. Desmarcar
// existe para el caso de haberse apurado: vuelve a quedar como estaba.
export async function setLocalWorkdaySyncSkipped(
  id: string,
  syncSkipped: boolean,
): Promise<void> {
  await db.update(workdays).set({ syncSkipped }).where(eq(workdays.id, id));
}

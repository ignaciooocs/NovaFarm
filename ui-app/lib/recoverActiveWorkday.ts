import { getHarvestEntries } from '@/api/generated/harvest-entries/harvest-entries';
import { getHarvesterWorkday } from '@/api/generated/harvester-workday/harvester-workday';
import { getUsers } from '@/api/generated/users/users';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import { harvestEntries, harvesterWorkday, workdays } from '@/db/schema';

// Reconstruye en SQLite local una jornada abierta que el server todavía
// tiene pero este dispositivo perdió (ej. se cerró sesión y se volvió a
// entrar con la misma cuenta después de que clearLocalData() vació la base
// — ver (drawer)/_layout.tsx). Usa el mismo `clientEntryId` que cada
// entidad ya devuelve en su respuesta (el mecanismo que hace idempotentes
// los reintentos de sync) como id local, así todo queda exactamente como si
// nunca se hubiera borrado — marcado `synced: true` porque, por definición,
// si está en el server ya está sincronizado.
async function recoverFromServer(uid: string): Promise<void> {
  const { usersControllerFindMe } = getUsers();
  const me = await usersControllerFindMe();

  const { workdaysControllerFindAll } = getWorkdays();
  const openWorkdays = await workdaysControllerFindAll({ status: 'OPEN' });
  const mine = openWorkdays.find((workday) => workday.recorderId === me._id);
  if (!mine) {
    return;
  }

  const localId = mine.clientEntryId;

  const { harvesterWorkdayControllerFindAll } = getHarvesterWorkday();
  const { harvestEntriesControllerFindAll } = getHarvestEntries();
  const [rosterRows, entryRows] = await Promise.all([
    harvesterWorkdayControllerFindAll({ workdayId: mine._id }),
    harvestEntriesControllerFindAll({ workdayId: mine._id }),
  ]);

  db.transaction((tx) => {
    tx.insert(workdays)
      .values({
        id: localId,
        serverId: mine._id,
        farmId: mine.farmId,
        date: mine.date,
        productId: mine.productId,
        defaultMeasurementUnitId: mine.defaultMeasurementUnitId,
        status: 'OPEN',
        finalTotalKg: null,
        synced: true,
        createdAt: mine.createdAt,
        createdByUid: uid,
      })
      .onConflictDoNothing()
      .run();

    rosterRows.forEach((row) => {
      tx.insert(harvesterWorkday)
        .values({
          id: row.clientEntryId,
          workdayId: localId,
          harvesterId: row.harvesterId,
          workdayNumber: row.workdayNumber,
          addedAt: row.addedAt,
          synced: true,
        })
        .onConflictDoNothing()
        .run();
    });

    entryRows.forEach((entry) => {
      tx.insert(harvestEntries)
        .values({
          id: entry.clientEntryId,
          workdayId: localId,
          harvesterId: entry.harvesterId,
          measurementUnitId: entry.measurementUnitId,
          unitCount: entry.unitCount,
          totalKg: entry.totalKg,
          recordedAt: entry.recordedAt,
          synced: true,
        })
        .onConflictDoNothing()
        .run();
    });
  });
}

// Reemplaza a getActiveWorkday() en las pantallas que deciden si hay que
// mostrar "jornada activa" u ofrecer abrir una nueva (Home, open-workday) —
// sin este paso de recuperación, esas dos pantallas podían pensar que no
// hay ninguna jornada abierta y, en open-workday.tsx, dejar crear una
// *segunda* jornada mientras la primera sigue abierta en el server (nada
// del lado del server impide hoy que un recorder tenga dos jornadas OPEN a
// la vez). Sin conexión, o si de verdad no hay ninguna, se resuelve a null
// como getActiveWorkday ya hacía — no es un error, solo no hay nada que
// recuperar por ahora.
export async function getActiveWorkdayWithRecovery(uid: string) {
  const local = await getActiveWorkday(uid);
  if (local) {
    return local;
  }

  try {
    await recoverFromServer(uid);
  } catch {
    return null;
  }

  return getActiveWorkday(uid);
}

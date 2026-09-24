import { and, eq } from 'drizzle-orm';
import {
  harvestersControllerSync,
} from '@/api/generated/harvesters/harvesters';
import { db } from '@/db/client';
import { harvestEntries, harvesters, harvesterWorkday } from '@/db/schema';
import { getRejectionMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores';

// Sube los cosechadores registrados offline en el campo (add-harvester.tsx)
// que todavía no tienen un _id real del server. Se llama SOLO desde el sync
// manual ("Sincronizar Jornada", ver sync.tsx) y antes que
// harvesterWorkdayControllerSync/harvestEntriesControllerSync — el server
// valida que el harvesterId de cada entrada del roster/entregas exista y
// esté activo en la farm, así que si todavía es un id local (no un
// ObjectId real) esa validación fallaría.
//
// Deliberadamente nunca se dispara solo al reconectar (a diferencia de
// syncCatalogs/syncFarmSettings): reescribir el id de un cosechador en
// cascada mientras el Anotador puede estar anotándole una entrega en ese
// mismo instante dejaría esa entrega con un harvesterId huérfano que nunca
// más sincroniza. Corriendo únicamente durante el sync manual, ese riesgo
// desaparece por diseño — el usuario no está anotando activamente mientras
// está parado en la pantalla de Sincronizar.
export async function pushPendingHarvesters(): Promise<{
  results: { status: string }[];
  rejectedReasons: string[];
}> {
  const farmId = useAuthStore.getState().claims.farmId;
  if (!farmId) {
    return { results: [], rejectedReasons: [] };
  }

  const pending = await db
    .select()
    .from(harvesters)
    .where(and(eq(harvesters.synced, false), eq(harvesters.farmId, farmId)));

  if (pending.length === 0) {
    return { results: [], rejectedReasons: [] };
  }

  const results = await harvestersControllerSync({
    entries: pending.map((harvester) => ({
      clientEntryId: harvester.id,
      firstName: harvester.firstName,
      lastName: harvester.lastName,
      nickname: harvester.nickname ?? undefined,
    })),
  });

  const rejectedReasons: string[] = [];

  db.transaction((tx) => {
    for (const result of results) {
      if (result.status === 'rejected' || !result._id) {
        if (result.status === 'rejected') {
          rejectedReasons.push(getRejectionMessage(result));
        }
        continue;
      }

      // Reescribe el id local por el real del server en cascada — en todo
      // el device, no solo en la jornada activa (un cosechador pendiente
      // pudo agregarse al roster de más de una jornada antes de subir).
      tx.update(harvesterWorkday)
        .set({ harvesterId: result._id })
        .where(eq(harvesterWorkday.harvesterId, result.clientEntryId))
        .run();
      tx.update(harvestEntries)
        .set({ harvesterId: result._id })
        .where(eq(harvestEntries.harvesterId, result.clientEntryId))
        .run();
      tx.update(harvesters)
        .set({ id: result._id, synced: true })
        .where(eq(harvesters.id, result.clientEntryId))
        .run();
    }
  });

  return { results, rejectedReasons };
}

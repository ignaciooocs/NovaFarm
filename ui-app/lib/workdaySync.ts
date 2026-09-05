import { and, eq } from 'drizzle-orm';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { db } from '@/db/client';
import { workdays } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores';

// Sube las jornadas abiertas sin conexión (open-workday.tsx escribe local y
// sigue de largo) y les completa el `serverId`, que es lo que después
// necesitan el roster y las entregas para poder subir: sus endpoints de
// sync validan `workdayId` con @IsMongoId(), así que un id local moriría en
// el ValidationPipe. Por eso esta función corre PRIMERO en el sync manual
// (ver sync.tsx) y también en fire-and-forget al abrir la jornada, para que
// con señal la jornada aparezca al toque en "Equipo activo ahora" de sus
// compañeros en vez de recién al sincronizar.
//
// A diferencia de harvesterSync.ts, acá no hay cascada de ids: el `id`
// local de la jornada nunca sale del dispositivo (las tablas hijas lo
// referencian y mandan el suyo propio como clientEntryId), así que lo único
// que se escribe de vuelta es serverId + synced sobre la misma fila.
export async function pushPendingWorkdays(): Promise<{
  rejectedReasons: string[];
}> {
  const farmId = useAuthStore.getState().claims.farmId;
  if (!farmId) {
    return { rejectedReasons: [] };
  }

  const pending = await db
    .select()
    .from(workdays)
    .where(and(eq(workdays.synced, false), eq(workdays.farmId, farmId)));

  const rejectedReasons: string[] = [];
  const { workdaysControllerCreate } = getWorkdays();

  // Una por una y cada una con su propio try/catch: POST /workdays no es un
  // endpoint batch con resultado por ítem como los /sync — un fallo (ej. 404
  // porque la fruta quedó inactiva entremedio) es una excepción, y no puede
  // tumbar la subida de las demás. Reintentar es seguro: el server hace
  // upsert por {farmId, clientEntryId}.
  for (const workday of pending) {
    try {
      const created = await workdaysControllerCreate({
        clientEntryId: workday.id,
        date: workday.date,
        fruitId: workday.fruitId,
        defaultMeasurementUnitId: workday.defaultMeasurementUnitId,
        createdAt: workday.createdAt,
      });

      await db
        .update(workdays)
        .set({ serverId: created._id, synced: true })
        .where(eq(workdays.id, workday.id));
    } catch (err) {
      rejectedReasons.push(getErrorMessage(err));
    }
  }

  return { rejectedReasons };
}

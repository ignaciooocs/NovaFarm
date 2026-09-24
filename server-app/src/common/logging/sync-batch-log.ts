import { Logger } from '@nestjs/common';
import { getSyncId } from '../context/request-context';
import { noteSyncBatch } from './sync-session-log';

const logger = new Logger('Sync');

/**
 * Lo mínimo que tiene en común el resultado de cualquier endpoint de sync:
 * cómo terminó cada entrada del lote, y por qué si fue rechazada.
 */
interface SyncBatchResult {
  status: 'created' | 'already-synced' | 'rejected';
  reason?: string;
}

/**
 * Una línea por lote sincronizado, con el desglose de cómo terminó.
 *
 * El log HTTP ya dice que la petición existió y cuánto tardó; esto dice qué
 * **pasó adentro**, que es lo que uno necesita cuando alguien reporta desde
 * el campo que "quedaron anotaciones pendientes": si el lote llegó completo,
 * si el server lo consideró un reintento (todo `already-synced`) o si algo
 * se rechazó y por qué.
 *
 * Cuando la petición viene marcada con un `X-Sync-Id` (todas las del sync
 * manual de ui-app lo traen), la línea lo lleva: con eso se puede seguir una
 * sincronización entera en el log aunque haya varios anotadores subiendo a
 * la vez.
 *
 * Incluye el primer motivo de rechazo porque cuando algo se rechaza, todo
 * el lote suele fallar por lo mismo (la jornada cerrada, un cosechador
 * desactivado). Son mensajes fijos del código, nunca datos del cosechador —
 * el log jamás lleva PII ni el body (ver request-logger.middleware.ts).
 */
export function logSyncBatch(
  scope: string,
  context: string,
  results: SyncBatchResult[],
  startedAt: number,
): void {
  let created = 0;
  let alreadySynced = 0;
  let rejected = 0;
  let firstReason: string | undefined;

  for (const result of results) {
    if (result.status === 'created') {
      created += 1;
    } else if (result.status === 'already-synced') {
      alreadySynced += 1;
    } else {
      rejected += 1;
      firstReason = firstReason ?? result.reason;
    }
  }

  const reason = rejected > 0 && firstReason ? ` · "${firstReason}"` : '';
  const syncId = getSyncId();
  const sync = syncId ? ` sync=${syncId}` : '';

  if (syncId) {
    noteSyncBatch(syncId, created + alreadySynced, rejected);
  }

  const line = `${scope}${sync} ${context} recibidas=${results.length} nuevas=${created} ya=${alreadySynced} rechazadas=${rejected}${reason} (${Date.now() - startedAt}ms)`;

  // Un lote con rechazos sale en amarillo (warn) en vez de verde: es lo
  // único de todo el bloque que amerita mirar dos veces.
  if (rejected > 0) {
    logger.warn(line);
  } else {
    logger.log(line);
  }
}

// El log de una sincronización completa, paso a paso, en la consola de
// Metro.
//
// Sincronizar es lo más parecido a una saga que tiene la app: cuatro etapas
// encadenadas (jornada → cosechadores → roster → anotaciones) donde cada una
// necesita el `_id` real que produjo la anterior, y donde una etapa puede
// fallar dejando a las siguientes sin nada que hacer. Cuando alguien reporta
// desde el campo que "quedaron anotaciones pendientes", lo que hay que poder
// leer de un vistazo es **en qué etapa se cortó y con qué números** — no un
// dump de objetos.
//
// Por eso cada línea es una sola línea, con conteos y tiempos, y con el
// mismo vocabulario que el log del server (ver common/logging/sync-batch-log.ts
// allá): las dos mitades de la misma historia se leen juntas.
//
// Solo en desarrollo: en un build de producción no imprime nada.

// Las etapas fijas del sync manual (ver sync.tsx). Está acá para que el
// numerito "2/4" no se desincronice del código si alguna vez se agrega una.
const TOTAL_STEPS = 4;

// Separador de apertura y cierre del bloque, igual que el del server.
const BAR = "=".repeat(10);

// Id de la corrida en curso, o null si no hay ninguna. Vive a nivel de
// módulo (y no dentro del SyncLog) porque quien lo necesita es el
// interceptor de axios, que no tiene forma de recibirlo por parámetro: con
// esto, **todas** las peticiones de una misma sincronización salen marcadas
// con el mismo id y el server las puede juntar en su log.
let currentSyncId: string | null = null;

export function getCurrentSyncId(): string | null {
  return currentSyncId;
}

export interface SyncLog {
  /** Cierra una etapa: imprime su número, su resumen y cuánto tardó. */
  step: (label: string, detail: string) => void;
  /** Una línea suelta dentro de una etapa (ej. cada lote de anotaciones). */
  note: (detail: string) => void;
  /** Cierra el sync completo, con el total acumulado. */
  done: (detail: string) => void;
  /** Cierra el sync porque se cortó: imprime el motivo y suelta el id. */
  fail: (detail: string) => void;
}

function line(syncId: string, text: string): void {
  if (__DEV__) {
    console.log(`[sync ${syncId}] ${text}`);
  }
}

export function startSyncLog(detail: string): SyncLog {
  const startedAt = Date.now();
  let stepStartedAt = startedAt;
  let step = 0;

  // Corto a propósito: se teclea a mano para buscarlo en el log del server.
  const syncId = Math.random().toString(36).slice(2, 8);
  currentSyncId = syncId;

  // Misma barra que el banner del server, para que las dos consolas se
  // lean igual (ver common/logging/sync-session-log.ts alla).
  line(syncId, `${BAR} INICIO · ${detail} ${BAR}`);

  return {
    step(label, stepDetail) {
      step += 1;
      const elapsed = Date.now() - stepStartedAt;
      stepStartedAt = Date.now();
      line(
        syncId,
        `${step}/${TOTAL_STEPS} ${label} · ${stepDetail} (${elapsed}ms)`,
      );
    },
    note(noteDetail) {
      line(syncId, `    ${noteDetail}`);
    },
    done(doneDetail) {
      line(
        syncId,
        `${BAR} FIN · ${doneDetail} (${Date.now() - startedAt}ms) ${BAR}`,
      );
      currentSyncId = null;
    },
    fail(failDetail) {
      line(
        syncId,
        `${BAR} CORTADO · ${failDetail} (${Date.now() - startedAt}ms) ${BAR}`,
      );
      // Soltar el id acá es tan importante como imprimir: si quedara puesto
      // después de una excepción, las peticiones sueltas de después (abrir
      // jornada, editar el pago) saldrían marcadas como parte de una
      // sincronización que ya terminó, y el log del server mentiría.
      currentSyncId = null;
    },
  };
}

/**
 * Resume el resultado de un lote como lo devuelven los endpoints de sync
 * (`created` / `already-synced` / `rejected`), con el mismo desglose que
 * loguea el server para ese mismo lote.
 */
export function summarizeBatch(results: { status: string }[]): string {
  let created = 0;
  let alreadySynced = 0;
  let rejected = 0;

  for (const result of results) {
    if (result.status === 'created') {
      created += 1;
    } else if (result.status === 'already-synced') {
      alreadySynced += 1;
    } else {
      rejected += 1;
    }
  }

  return `${created} nuevas, ${alreadySynced} ya estaban, ${rejected} rechazadas`;
}

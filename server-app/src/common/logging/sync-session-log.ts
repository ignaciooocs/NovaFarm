import { Logger } from '@nestjs/common';

const logger = new Logger('Sync');

// Una sincronización son varias peticiones seguidas, y el server no tiene
// forma de saber cuál es la última: el celular no avisa que terminó. Se da
// por cerrada cuando pasa este rato sin que llegue otra petición de la misma
// corrida — suficiente para que un lote lento (o la pausa entre etapas) no
// parta el bloque en dos, y corto para que el cierre se vea al tiro.
const IDLE_MS = 20_000;

const SEPARATOR = '═'.repeat(14);

interface OpenSync {
  startedAt: number;
  requests: number;
  rows: number;
  rejected: number;
  timer: NodeJS.Timeout;
}

// Corridas abiertas, por id. Es un Map y no una sola variable porque dos
// anotadores pueden estar sincronizando al mismo tiempo: cada bloque se abre
// y se cierra por su cuenta, y como cada línea lleva su `sync=<id>`, los
// bloques intercalados se siguen leyendo igual.
const openSyncs = new Map<string, OpenSync>();

// Negrita solo en una terminal de verdad. En un archivo o en el agregador de
// logs de un PaaS, los códigos ANSI serían basura dentro del texto.
function bold(text: string): string {
  return process.stdout.isTTY ? `[1m${text}[22m` : text;
}

function banner(text: string): void {
  logger.log(bold(`${SEPARATOR} ${text} ${SEPARATOR}`));
}

function formatElapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function scheduleClose(syncId: string, sync: OpenSync): void {
  clearTimeout(sync.timer);
  // unref: un sync abierto nunca debe ser motivo para que el proceso siga
  // vivo (importa al apagar el server o al correr los tests).
  sync.timer = setTimeout(() => closeSync(syncId), IDLE_MS);
  sync.timer.unref();
}

function closeSync(syncId: string): void {
  const sync = openSyncs.get(syncId);
  if (!sync) {
    return;
  }

  clearTimeout(sync.timer);
  openSyncs.delete(syncId);

  const rejected =
    sync.rejected > 0 ? `${sync.rejected} rechazos` : 'sin rechazos';

  banner(
    `sync ${syncId} · FIN · ${sync.requests} peticiones · ${sync.rows} filas · ${rejected} (${formatElapsed(Date.now() - sync.startedAt)})`,
  );
}

/**
 * Marca que llegó una petición de una sincronización. La primera de cada
 * corrida abre el bloque en el log; las siguientes solo suman al total.
 *
 * Se llama al **entrar** la petición (no al terminarla) para que la línea de
 * inicio quede arriba de todo lo que esa petición vaya a loguear.
 */
export function noteSyncRequest(syncId: string): void {
  const current = openSyncs.get(syncId);

  if (current) {
    current.requests += 1;
    scheduleClose(syncId, current);
    return;
  }

  const sync: OpenSync = {
    startedAt: Date.now(),
    requests: 1,
    rows: 0,
    rejected: 0,
    timer: setTimeout(() => undefined, 0),
  };
  openSyncs.set(syncId, sync);
  scheduleClose(syncId, sync);

  banner(`sync ${syncId} · INICIO`);
}

/**
 * Suma al total de la corrida lo que resolvió un lote, para poder cerrarla
 * con el acumulado ("5 peticiones · 218 filas · sin rechazos").
 */
export function noteSyncBatch(
  syncId: string,
  rows: number,
  rejected: number,
): void {
  const current = openSyncs.get(syncId);
  if (!current) {
    return;
  }

  current.rows += rows;
  current.rejected += rejected;
}

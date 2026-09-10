import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Datos que acompañan a una petición de punta a punta sin tener que pasarlos
 * por parámetro capa por capa. Hoy solo el id de sincronización, que es lo
 * que permite juntar en el log las 3-4 peticiones sueltas que componen una
 * misma sincronización (jornada → cosechadores → roster → anotaciones).
 *
 * `AsyncLocalStorage` es de Node, no una dependencia nueva, y sobrevive a
 * los `await` de Mongoose: lo que se guarda al entrar la petición sigue
 * disponible dentro del service, sin que el service tenga que saber que
 * existe un HTTP encima.
 */
export interface RequestContext {
  syncId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getSyncId(): string | undefined {
  return storage.getStore()?.syncId;
}

// El id lo manda el cliente por header, o sea que es texto no confiable que
// termina escrito en el log. Se acepta solo si es corto y alfanumérico:
// sin esto, un valor con un salto de línea adentro podría escribir líneas
// falsas en el log del server (log injection) y arruinar justamente lo que
// este id existe para poder leer.
const SYNC_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function sanitizeSyncId(value: unknown): string | undefined {
  return typeof value === 'string' && SYNC_ID_PATTERN.test(value)
    ? value
    : undefined;
}

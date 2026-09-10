import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser } from '../../auth/guards/farm-scope.guard';
import {
  runWithRequestContext,
  sanitizeSyncId,
} from '../context/request-context';
import { noteSyncRequest } from '../logging/sync-session-log';

/**
 * Una línea por request: qué endpoint se llamó, cómo terminó, quién lo pidió
 * y —si viene— a qué sincronización pertenece.
 *
 * Ese último dato es lo que convierte varias líneas sueltas en una historia:
 * una sincronización son 3-4 peticiones distintas (jornada, cosechadores,
 * roster, anotaciones) y el server no tiene forma de saber por su cuenta que
 * son la misma corrida. `ui-app` manda un `X-Sync-Id` por corrida (ver
 * lib/syncLog.ts allá), y con eso un `grep sync=3f9c2a` en el log del server
 * devuelve la sincronización completa, en orden, aunque dos anotadores estén
 * sincronizando al mismo tiempo.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const syncId = sanitizeSyncId(req.headers['x-sync-id']);

    // Antes de atender la petición, para que la línea que abre el bloque
    // quede arriba de todo lo que esta misma petición vaya a loguear.
    if (syncId) {
      noteSyncRequest(syncId);
    }

    // Se loguea en 'finish' y no acá por dos razones: recién ahí existen el
    // status y la duración, y para ese momento los guards ya poblaron
    // request.user (un middleware corre antes que ellos, así que leer el uid
    // al entrar daría siempre 'anon'). De paso quedan registradas las
    // requests que ni llegan al controller — 401 por token vencido, 429 del
    // throttler — que son justo las que uno anda buscando cuando el sync
    // falla desde el campo.
    res.on('finish', () => {
      const { user } = req as Request & { user?: AuthenticatedUser };
      const caller = user ? `uid=${user.uid} farm=${user.farmId}` : 'anon';

      // Nunca el body: los lotes de sync son enormes y traen datos personales
      // del cosechador (nationalId). El endpoint + quién llamó alcanza para
      // seguirle la pista a una sincronización.
      const sync = syncId ? ` sync=${syncId}` : '';

      // verbose y no log: en la consola sale en otro color que las líneas
      // de [Sync], así el resumen de negocio destaca sobre el tráfico HTTP,
      // que es el detalle de apoyo.
      this.logger.verbose(
        `${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt}ms) ${caller}${sync}`,
      );
    });

    // El resto de la petición (guards, controller, services) corre dentro
    // del contexto, así que cualquier log de más abajo puede recuperar el
    // syncId sin recibirlo por parámetro.
    runWithRequestContext({ syncId }, () => next());
  }
}

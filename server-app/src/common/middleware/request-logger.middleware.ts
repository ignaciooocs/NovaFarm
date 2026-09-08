import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser } from '../../auth/guards/farm-scope.guard';

/**
 * Una línea por request: qué endpoint se llamó, cómo terminó y quién lo pidió.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

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
      this.logger.log(
        `${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt}ms) ${caller}`,
      );
    });

    next();
  }
}

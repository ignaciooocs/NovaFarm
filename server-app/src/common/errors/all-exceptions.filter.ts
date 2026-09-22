import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';
import type { ErrorCode } from './error-codes';

/**
 * Le pone `code` a **toda** respuesta de error, no solo a las
 * `AppException`.
 *
 * Sin esto, `ui-app` tendría un `switch` por código para los errores de
 * negocio y seguiría adivinando por texto para el resto: un 400 del
 * ValidationPipe, un 429 del throttler, una ruta mal armada. Con el filtro,
 * el contrato es uno solo — todo error trae `{ statusCode, code, message }`.
 *
 * El `message` se conserva tal cual venía (la app vieja lo sigue leyendo) y
 * los status no cambian: esto solo suma un campo.
 */
/**
 * El código que hereda un error que no es una `AppException`, según su
 * status. Alcanza para que la app distinga "tu sesión venció" de "algo no
 * cuadra en lo que mandaste", que es todo lo que puede decir sin saber más.
 *
 * El 404 merece una aclaración: todo 404 de negocio ya tira `AppException`
 * con su propio código, así que uno pelado es una ruta que no existe — el
 * caso que alguna vez le hizo decir a la app "código de invitación
 * inválido" cuando en realidad la URL estaba mal armada.
 */
const GENERIC_CODES: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'TOKEN_INVALID',
  [HttpStatus.FORBIDDEN]: 'ROLE_NOT_ALLOWED',
  [HttpStatus.NOT_FOUND]: 'ROUTE_NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(this.withCode(status, exception));
      return;
    }

    // Lo que llegue acá no lo previó nadie: un error de Mongo, un TypeError.
    // Hacia afuera va un genérico —nunca el detalle interno, que puede traer
    // datos de la base—, y hacia el log una línea con el endpoint y el
    // error. El stack va aparte, como segundo argumento: es un 500 real, y
    // sin él no hay por dónde empezar a buscar.
    const request = http.getRequest<Request>();
    const error = exception instanceof Error ? exception : undefined;
    this.logger.error(
      `500 ${request.method} ${request.originalUrl} · ${error?.name ?? 'Error'}: ${error?.message ?? String(exception)}`,
      error?.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL' satisfies ErrorCode,
      message: 'Internal server error',
    });
  }

  private withCode(
    status: number,
    exception: HttpException,
  ): Record<string, unknown> {
    const body = exception.getResponse();

    // Una AppException ya viene armada con su código; el resto hereda uno
    // genérico según el status, que es todo lo que la app necesita para
    // distinguir "tu sesión venció" de "algo no cuadra en lo que mandaste".
    if (exception instanceof AppException) {
      return body as Record<string, unknown>;
    }

    const code = GENERIC_CODES[status] ?? 'INTERNAL';
    if (typeof body === 'string') {
      return { statusCode: status, code, message: body };
    }
    return { ...(body as Record<string, unknown>), code };
  }
}

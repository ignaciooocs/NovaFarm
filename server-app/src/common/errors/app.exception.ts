import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

/**
 * Una excepción de negocio con código estable (ver `error-codes.ts`).
 *
 * Reemplaza a las de Nest (`NotFoundException` y compañía) en todo lo que
 * `ui-app` tiene que poder distinguir. El body que sale por HTTP conserva el
 * mismo shape de antes —`{ statusCode, message }`— y solo suma `code`, así
 * que una versión vieja de la app que todavía mire el mensaje sigue
 * funcionando igual.
 *
 * Los `create()` de abajo son para que cada `throw` diga en una línea qué
 * status le corresponde, sin repetir el enum de Nest en cada archivo.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
  ) {
    super({ statusCode: status, code, message }, status);
  }

  static badRequest(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.BAD_REQUEST, message);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.UNAUTHORIZED, message);
  }

  static forbidden(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.FORBIDDEN, message);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.NOT_FOUND, message);
  }

  static conflict(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.CONFLICT, message);
  }

  /** 410: el recurso existió y ya no sirve — hoy solo el código vencido. */
  static gone(code: ErrorCode, message: string): AppException {
    return new AppException(code, HttpStatus.GONE, message);
  }
}

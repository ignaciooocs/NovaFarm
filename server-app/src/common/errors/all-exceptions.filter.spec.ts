import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

interface CapturedResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function hostWith(response: CapturedResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', originalUrl: '/api/v1/workdays' }),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: CapturedResponse;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('deja pasar el código de una AppException tal cual', () => {
    filter.catch(
      AppException.conflict('WORKDAY_CLOSED_PAY', 'Cannot change the pay'),
      hostWith(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'WORKDAY_CLOSED_PAY',
      message: 'Cannot change the pay',
    });
  });

  // El caso real es el ValidationPipe, que manda `message` como arreglo: el
  // filtro tiene que sumarle el código sin tocar lo que ya venía, porque la
  // app arma el texto juntando ese arreglo.
  it('le pone VALIDATION_FAILED a un 400 que no es AppException, sin perder el mensaje', () => {
    filter.catch(
      new BadRequestException(['name should not be empty']),
      hostWith(response),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: ['name should not be empty'],
      }),
    );
  });

  // Todo 404 de negocio tira AppException, así que uno pelado es una ruta que
  // no existe — la app no debe confundirlo con "no encontré tu jornada".
  it('distingue un 404 de ruta inexistente', () => {
    filter.catch(new NotFoundException(), hostWith(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }),
    );
  });

  it('convierte cualquier otro error en un 500 genérico, sin filtrar el detalle', () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    filter.catch(
      new Error('E11000 duplicate key error collection: farms'),
      hostWith(response),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Internal server error',
    });
    // Hacia afuera nada del detalle interno; hacia el log, una línea con él.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain('E11000');

    logged.mockRestore();
  });
});

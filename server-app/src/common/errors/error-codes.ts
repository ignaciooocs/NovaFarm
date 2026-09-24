/**
 * Identificador estable de cada error que la API puede devolver.
 *
 * **Este es el contrato con `ui-app`, no el mensaje.** El texto en inglés de
 * cada excepción es para el log y para Swagger, y se puede reescribir cuando
 * sea; el código no. Antes la app elegía qué mostrarle al usuario haciendo
 * regex sobre ese texto (`lib/errors.ts`), y nada avisaba cuando dejaban de
 * calzar: reformular un mensaje acá hacía que allá saliera "Algo salió mal"
 * sin que fallara ni el tsc ni un test. Pasó de verdad con el cultivo
 * repetido.
 *
 * Agregar un código nuevo obliga a decidir qué mensaje en español le toca en
 * `ui-app/lib/errors.ts`, que es justo lo que se quiere.
 */
export type ErrorCode =
  // Autenticación y onboarding
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'ONBOARDING_INCOMPLETE'
  | 'ROLE_NOT_ALLOWED'
  | 'INVITATION_CODE_INVALID'
  | 'INVITATION_CODE_EXPIRED'
  | 'ALREADY_ONBOARDED'
  // Farm
  | 'FARM_NOT_FOUND'
  // Cosechadores
  | 'HARVESTER_NOT_FOUND'
  // Unidades de medida
  | 'UNIT_NOT_FOUND'
  | 'UNIT_NAME_TAKEN'
  | 'UNIT_KG_FACTOR_REQUIRED'
  // Cultivos
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_NOT_AVAILABLE'
  | 'PRODUCT_ALREADY_IN_CATALOG'
  | 'PRODUCT_NAME_TAKEN'
  | 'PRODUCT_NAME_REQUIRED'
  | 'PRODUCT_FROM_APP_CATALOG'
  | 'PRODUCT_FROM_ANOTHER_FARM'
  | 'PRODUCT_USED_IN_WORKDAY'
  // Usuarios
  | 'USER_NOT_FOUND'
  | 'USER_ROLES_EMPTY'
  // Jornadas
  | 'WORKDAY_NOT_FOUND'
  | 'WORKDAY_CLOSED_PAY'
  | 'PAY_BASIS_INVALID'
  // Rechazos por fila de los endpoints de sync. No son excepciones: viajan
  // en `reasonCode` dentro de cada resultado (ver los Sync*ResponseDto),
  // porque un lote puede traer unas filas aceptadas y otras rechazadas.
  // Comparten este mismo enum a propósito — para `ui-app` es un error del
  // server igual que cualquier otro, y sale por el mismo mapa de mensajes.
  | 'WORKDAY_CLOSED'
  | 'HARVESTER_NOT_IN_ROSTER'
  | 'HARVESTER_ALREADY_IN_ROSTER'
  | 'WORKDAY_NUMBER_TAKEN'
  | 'MEASURED_KG_NOT_ALLOWED'
  | 'WEIGHT_KG_REQUIRED'
  | 'UNIT_KG_FACTOR_MISSING'
  // Genéricos: los pone el filtro para lo que no tira una AppException —
  // el ValidationPipe, el throttler, una ruta que no existe, un 500.
  | 'VALIDATION_FAILED'
  | 'ROUTE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL';

import { FirebaseError } from 'firebase/app';
import { isAxiosError } from 'axios';
import { strings } from '@/constants/strings';

// Traduce un error de Firebase Auth a un mensaje en español ya listo para
// mostrar en pantalla. Los códigos de Firebase son estables (parte de su
// API pública), así que mapearlos acá es seguro.
function firebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return strings.errors.invalidEmail;
    case 'auth/email-already-in-use':
      return strings.errors.emailInUse;
    case 'auth/weak-password':
      return strings.errors.weakPassword;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return strings.errors.invalidCredential;
    case 'auth/too-many-requests':
      return strings.errors.tooManyRequests;
    case 'auth/network-request-failed':
      return strings.errors.network;
    default:
      return strings.errors.generic;
  }
}

/**
 * Qué le decimos al usuario por cada error de `server-app`.
 *
 * Las llaves son los códigos de `server-app/src/common/errors/error-codes.ts`
 * — el server los manda en `code` dentro del body de todo error. **Antes
 * esto matcheaba el mensaje en inglés con expresiones regulares**, y nada
 * avisaba cuando dejaban de calzar: bastaba con que alguien reformulara un
 * mensaje allá para que acá saliera "Algo salió mal". Pasó de verdad — el
 * cultivo repetido al agregarlo al catálogo decía eso, porque el server tira
 * "This product is already in the farm catalog" y la regex buscaba otra
 * frase.
 *
 * Los dos lados no comparten tipos (son dos apps separadas, sin paquete
 * común), así que TypeScript no puede exigir que esta lista esté completa:
 * un código sin entrada cae en `generic`, igual que antes. Al agregar uno en
 * el server, agregarlo acá.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  // Sesión y permisos. Estos son los que más confundían: el anotador tocaba
  // algo de admin y no pasaba nada, sin explicación.
  TOKEN_MISSING: strings.errors.sessionExpired,
  TOKEN_INVALID: strings.errors.sessionExpired,
  ONBOARDING_INCOMPLETE: strings.errors.onboardingIncomplete,
  ROLE_NOT_ALLOWED: strings.errors.roleNotAllowed,
  RATE_LIMITED: strings.errors.tooManyRequests,
  VALIDATION_FAILED: strings.errors.validationFailed,

  // Onboarding
  INVITATION_CODE_INVALID: strings.errors.invalidInvitationCode,
  INVITATION_CODE_EXPIRED: strings.errors.expiredInvitationCode,
  ALREADY_ONBOARDED: strings.errors.alreadyOnboarded,

  // Catálogos
  FARM_NOT_FOUND: strings.errors.farmNotFound,
  HARVESTER_NOT_FOUND: strings.errors.harvesterNotFound,
  UNIT_NOT_FOUND: strings.errors.unitNotFound,
  UNIT_NAME_TAKEN: strings.errors.duplicateUnitName,
  UNIT_KG_FACTOR_REQUIRED: strings.errors.unitKgFactorRequired,
  PRODUCT_NOT_FOUND: strings.errors.productNotFound,
  PRODUCT_NOT_AVAILABLE: strings.errors.productNotAvailable,
  PRODUCT_ALREADY_IN_CATALOG: strings.errors.productAlreadyInCatalog,
  PRODUCT_NAME_TAKEN: strings.errors.duplicateProductName,
  PRODUCT_NAME_REQUIRED: strings.errors.productNameRequired,
  PRODUCT_FROM_APP_CATALOG: strings.errors.productFromAppCatalog,
  PRODUCT_FROM_ANOTHER_FARM: strings.errors.productFromAnotherFarm,
  PRODUCT_USED_IN_WORKDAY: strings.errors.productUsedInWorkday,

  // Equipo
  USER_NOT_FOUND: strings.errors.userNotFound,
  USER_ROLES_EMPTY: strings.errors.userRolesEmpty,

  // Jornadas
  WORKDAY_NOT_FOUND: strings.errors.workdayNotFound,
  WORKDAY_CLOSED_PAY: strings.errors.workdayClosedPay,
  PAY_BASIS_INVALID: strings.errors.payBasisInvalid,

  // ROUTE_NOT_FOUND e INTERNAL quedan fuera a propósito: son errores
  // nuestros, no del usuario, y no hay nada que pueda hacer con el detalle.
};

// Lee el `code` del body de un error de la API, si viene. Exportada para los
// pocos lugares que no quieren un mensaje sino decidir algo según el error.
export function getErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) {
    return null;
  }
  const data = error.response?.data as { code?: unknown } | undefined;
  return typeof data?.code === 'string' ? data.code : null;
}

/**
 * Si el server rechazó un código de invitación porque venció, no porque no
 * exista. Exportada porque "Unirme" ofrece "Pedir código nuevo" solo en ese
 * caso.
 */
export function isExpiredInvitationCodeError(error: unknown): boolean {
  return getErrorCode(error) === 'INVITATION_CODE_EXPIRED';
}

// Punto de entrada único: recibe cualquier error atrapado en un catch (de
// Firebase o de una llamada a la API) y devuelve el mensaje en español que
// corresponde mostrarle al usuario.
export function getErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return firebaseErrorMessage(error.code);
  }

  if (isAxiosError(error)) {
    // Sin respuesta no hay código que mirar: no llegamos al server.
    if (!error.response) {
      return strings.errors.network;
    }
    const code = getErrorCode(error);
    return (code && MESSAGE_BY_CODE[code]) || strings.errors.generic;
  }

  return strings.errors.generic;
}

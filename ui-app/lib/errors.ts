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

// Traduce un error de la API de server-app (axios) a un mensaje en español.
// server-app usa NotFoundException/ConflictException con mensajes propios en
// inglés (ver auth.service.ts), con el shape estándar de Nest:
// { statusCode, message, error }. Se matchea sobre el texto real del
// mensaje, no solo el status code — un mismo código (404, 409) puede
// significar cosas distintas según el endpoint, y confiar únicamente en el
// número ya nos hizo mostrar "código de invitación inválido" para un error
// que en realidad era una ruta mal armada (404 de Express, no de Nest).
function apiErrorMessage(error: {
  response?: { status?: number; data?: unknown };
}): string {
  const data = error.response?.data as { message?: unknown } | undefined;
  const message = Array.isArray(data?.message)
    ? data.message.join(' ')
    : typeof data?.message === 'string'
      ? data.message
      : '';

  if (/invitation code/i.test(message)) {
    return strings.errors.invalidInvitationCode;
  }
  if (/already completed onboarding/i.test(message)) {
    return strings.errors.alreadyOnboarded;
  }

  return strings.errors.generic;
}

// Punto de entrada único: recibe cualquier error atrapado en un catch (de
// Firebase o de una llamada a la API) y devuelve el mensaje en español que
// corresponde mostrarle al usuario.
export function getErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return firebaseErrorMessage(error.code);
  }

  if (isAxiosError(error)) {
    if (!error.response) {
      return strings.errors.network;
    }
    return apiErrorMessage(error);
  }

  return strings.errors.generic;
}

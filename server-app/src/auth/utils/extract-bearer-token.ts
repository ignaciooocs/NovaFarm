import { AppException } from '../../common/errors/app.exception';

/**
 * Extracts the bearer token from an Authorization header value.
 * Shared by FirebaseAuthGuard and FarmScopeGuard so both fail the same way
 * on a missing/malformed header.
 */
export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppException.unauthorized('TOKEN_MISSING', 'Missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    throw AppException.unauthorized('TOKEN_MISSING', 'Missing bearer token');
  }

  return token;
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { FirebaseAdminService } from '../firebase-admin.service';
import { extractBearerToken } from '../utils/extract-bearer-token';

export interface FirebaseUser {
  uid: string;
  email: string;
}

/**
 * Verifies the caller presents a valid Firebase ID token. Does NOT require
 * farmId/roles custom claims to be present — use this alone on routes that
 * run before onboarding completes (e.g. auth/register/*). For routes that
 * need tenant scope, use FarmScopeGuard instead.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);

    try {
      const decoded = await this.firebaseAdminService.verifyIdToken(token);
      (request as Request & { firebaseUser: FirebaseUser }).firebaseUser = {
        uid: decoded.uid,
        email: decoded.email as string,
      };
      return true;
    } catch {
      throw AppException.unauthorized(
        'TOKEN_INVALID',
        'Invalid or expired token',
      );
    }
  }
}

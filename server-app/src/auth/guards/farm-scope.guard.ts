import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as admin from 'firebase-admin';
import { FirebaseAdminService } from '../firebase-admin.service';
import { extractBearerToken } from '../utils/extract-bearer-token';

export interface AuthenticatedUser {
  uid: string;
  farmId: string;
  roles: Array<'recorder' | 'admin' | 'supervisor'>;
}

// firebase-admin's DecodedIdToken types custom claims via a `[key: string]: any`
// index signature. Narrow to this shape once, via `as unknown as`, so reading
// farmId/roles below doesn't trip @typescript-eslint/no-unsafe-member-access.
interface FirebaseCustomClaims {
  farmId?: string;
  roles?: Array<'recorder' | 'admin' | 'supervisor'>;
}

/**
 * Verifies the caller presents a valid Firebase ID token AND that its
 * farmId/roles custom claims are present, attaching them to request.user.
 * This is the guard entity controllers (fruits, harvesters, ...) should use
 * once they exist — a missing guard is then visible at the route level
 * instead of a bug buried in a service method (see CLAUDE.md).
 */
@Injectable()
export class FarmScopeGuard implements CanActivate {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await this.firebaseAdminService.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const claims = decoded as unknown as FirebaseCustomClaims;

    if (!claims.farmId) {
      throw new ForbiddenException('Account has not completed onboarding');
    }

    (request as Request & { user: AuthenticatedUser }).user = {
      uid: decoded.uid,
      farmId: claims.farmId,
      roles: claims.roles ?? [],
    };

    return true;
  }
}

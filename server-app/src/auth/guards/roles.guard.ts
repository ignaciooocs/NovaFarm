import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from './farm-scope.guard';

/**
 * Restricts a route to the role(s) declared via @Roles() — authorizes if
 * the caller has *any* of them, since a user can hold several at once (the
 * server never needs to know which one is the caller's currently "active"
 * mode, that's local-only client state). Reads request.user.roles, so it
 * must run after FarmScopeGuard on the same route:
 * @UseGuards(FarmScopeGuard, RolesGuard). A route with no @Roles()
 * decorator is left unrestricted by this guard (falls through to true) —
 * @Roles() is what opts a route into role-checking, not this guard alone.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      Array<'recorder' | 'admin' | 'supervisor'> | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    if (!requiredRoles.some((role) => request.user.roles.includes(role))) {
      throw AppException.forbidden(
        'ROLE_NOT_ALLOWED',
        'This action requires a different role',
      );
    }

    return true;
  }
}

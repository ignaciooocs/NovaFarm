import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from './farm-scope.guard';

/**
 * Restricts a route to the role(s) declared via @Roles(). Reads
 * request.user.role, so it must run after FarmScopeGuard on the same
 * route: @UseGuards(FarmScopeGuard, RolesGuard). A route with no @Roles()
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

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('This action requires a different role');
    }

    return true;
  }
}

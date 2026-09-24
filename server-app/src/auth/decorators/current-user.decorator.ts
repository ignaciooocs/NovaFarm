import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../guards/farm-scope.guard';

/**
 * Reads the full authenticated user off request.user, populated by
 * FarmScopeGuard. Assumes FarmScopeGuard already ran on this route — does
 * not perform its own verification. Use @CurrentFarm() instead when only
 * farmId is needed.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);

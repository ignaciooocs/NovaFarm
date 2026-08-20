import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../guards/farm-scope.guard';

/**
 * Reads farmId off request.user, populated by FarmScopeGuard. Assumes
 * FarmScopeGuard already ran on this route — does not perform its own
 * verification.
 */
export const CurrentFarm = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user.farmId;
  },
);

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  function contextWith(role: 'recorder' | 'admin'): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { uid: 'u', farmId: 'f', role } }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    rolesGuard = new RolesGuard(reflector);
  });

  it('allows the request when the route has no @Roles() metadata', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    expect(rolesGuard.canActivate(contextWith('recorder'))).toBe(true);
  });

  it('allows the request when the caller has one of the required roles', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    expect(rolesGuard.canActivate(contextWith('admin'))).toBe(true);
  });

  it('throws ForbiddenException when the caller lacks a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    expect(() => rolesGuard.canActivate(contextWith('recorder'))).toThrow(
      ForbiddenException,
    );
  });
});

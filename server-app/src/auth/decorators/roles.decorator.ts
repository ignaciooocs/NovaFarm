import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marks a route as restricted to the given role(s). Must be paired with
 * RolesGuard on the same controller/route (after FarmScopeGuard, which
 * populates request.user.role) — @Roles() alone does not enforce anything.
 */
export const Roles = (
  ...roles: Array<'recorder' | 'admin' | 'supervisor'>
) => SetMetadata(ROLES_KEY, roles);

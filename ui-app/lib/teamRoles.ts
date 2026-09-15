import type { FindUserResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { strings } from '@/constants/strings';

type UserRole = FindUserResponseDto['roles'][number];

// Los roles que un admin puede asignar desde Mi equipo. `admin` nunca está:
// el server no deja otorgarlo ni quitarlo por esta vía (ver
// UpdateUserRolesRequestDto), solo agregar/quitar estos dos encima.
export type AssignableRole = 'recorder' | 'supervisor';
export const ASSIGNABLE_ROLES: AssignableRole[] = ['recorder', 'supervisor'];

export function roleLabelFor(role: UserRole): string {
  if (role === 'admin') {
    return strings.admin.roleAdmin;
  }
  return role === 'supervisor'
    ? strings.admin.roleSupervisor
    : strings.admin.roleRecorder;
}

export function rolesLabelFor(roles: UserRole[]): string {
  return roles.map(roleLabelFor).join(', ');
}

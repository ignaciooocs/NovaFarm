import { useMemo } from 'react';
import { useActiveRoleStore, useAuthStore, type Role } from '@/stores';

export interface Capabilities {
  canRecord: boolean;
  canViewTeam: boolean;
  canManageTeamRoles: boolean;
  // Rol puro — se combina con el interruptor por-farm
  // (farms.recordersCanManageCatalog) en cada call site, igual que hoy.
  canManageCatalog: boolean;
  canManageFarmSettings: boolean;
}

const NONE: Capabilities = {
  canRecord: false,
  canViewTeam: false,
  canManageTeamRoles: false,
  canManageCatalog: false,
  canManageFarmSettings: false,
};

// Un solo lugar que sabe qué puede hacer cada rol (sistema multirol,
// ui-arquitectura.md §5) — las pantallas preguntan capabilities.canX, nunca
// role === 'x'. Reproduce exactamente el gateo por-rol que ya existía antes
// de este archivo, nada de comportamiento nuevo: admin puede todo, recorder
// solo anota, supervisor solo mira el equipo.
export function getCapabilities(activeRole: Role | null): Capabilities {
  switch (activeRole) {
    case 'admin':
      return {
        canRecord: true,
        canViewTeam: true,
        canManageTeamRoles: true,
        canManageCatalog: true,
        canManageFarmSettings: true,
      };
    case 'recorder':
      return { ...NONE, canRecord: true };
    case 'supervisor':
      return { ...NONE, canViewTeam: true };
    default:
      return NONE;
  }
}

// Resuelve el rol activo efectivo contra los roles asignados a la cuenta: si
// el rol activo guardado ya no está entre los asignados (un admin se lo
// quitó, o todavía no se eligió ninguno) cae al primer rol disponible en vez
// de dejar a la persona sin capacidades por un estado local desactualizado.
export function useCapabilities(): Capabilities {
  const roles = useAuthStore((state) => state.claims.roles);
  const activeRole = useActiveRoleStore((state) => state.activeRole);

  return useMemo(() => {
    const effectiveRole =
      activeRole && roles.includes(activeRole) ? activeRole : (roles[0] ?? null);
    return getCapabilities(effectiveRole);
  }, [roles, activeRole]);
}

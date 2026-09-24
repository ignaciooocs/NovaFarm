import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Role } from './useAuthStore';

interface ActiveRoleState {
  activeRole: Role | null;
  setActiveRole: (role: Role) => void;
}

// Sistema multirol (ui-arquitectura.md §5): cuál de los roles asignados a la
// cuenta está "activo" ahora mismo es puro estado local del dispositivo,
// nunca pega a la red — mismo patrón que useThemeStore. A propósito nunca se
// deriva/persiste desde los custom claims de Firebase, para que cambiar de
// modo funcione sin conexión. Si el rol activo guardado ya no está entre los
// roles asignados de la cuenta (un admin se lo quitó, o es la primera vez),
// useCapabilities() (ver lib/permissions.ts) cae sola al primer rol
// disponible — no hace falta reconciliar acá.
export const useActiveRoleStore = create<ActiveRoleState>()(
  persist(
    (set) => ({
      activeRole: null,
      setActiveRole: (role) => set({ activeRole: role }),
    }),
    {
      name: 'anotaya-active-role',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

import { create } from 'zustand';

interface FarmSettingsState {
  // Interruptor único por farm — si un recorder puede ver/gestionar el
  // catálogo, además de un admin (no afecta a "Mi equipo", que sigue siendo
  // admin-only siempre). Optimista en true hasta el primer fetch real —
  // "por defecto tienen acceso" fue la decisión explícita al diseñar esto.
  recordersCanManageCatalog: boolean;
}

export const useFarmSettingsStore = create<FarmSettingsState>(() => ({
  recordersCanManageCatalog: true,
}));

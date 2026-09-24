import { create } from 'zustand';

// Guarda solo el id de la jornada local activa — un puntero, no los datos.
// Fruta/unidad/fecha/status se leen de SQLite (db/schema.ts `workdays`) vía
// ese id, para que no haya dos fuentes de verdad para el mismo dato.
interface ActiveWorkdayState {
  workdayId: string | null;
  setActiveWorkdayId: (workdayId: string | null) => void;
}

export const useActiveWorkdayStore = create<ActiveWorkdayState>((set) => ({
  workdayId: null,
  setActiveWorkdayId: (workdayId) => set({ workdayId }),
}));

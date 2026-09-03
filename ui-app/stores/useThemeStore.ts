import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_PALETTE,
  neutralColors,
  palettes,
  type PaletteName,
} from '@/theme/colors';

interface ThemeState {
  palette: PaletteName;
  setPalette: (palette: PaletteName) => void;
}

// Preferencia del dispositivo, no de la farm — cada usuario elige su propio
// color, no algo que se sincronice entre cuentas. Persistida local con
// zustand/middleware `persist` sobre AsyncStorage (mismo storage que ya usa
// la sesión de Firebase, ver lib/firebase.ts) para que sobreviva a cerrar
// la app.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      palette: DEFAULT_PALETTE,
      setPalette: (palette) => set({ palette }),
    }),
    {
      name: 'anotaya-theme-palette',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// El set completo de colores que consume una pantalla: los fijos
// (neutralColors) más los de marca del tema activo (primary/primaryDark/
// secondary). Cualquier estilo que dependa de un color de marca debe leerlo
// de acá (recalculado en cada render vía el hook, no de un `StyleSheet`
// estático a nivel de módulo) para reaccionar de verdad al cambio de tema.
export function usePalette() {
  const paletteName = useThemeStore((state) => state.palette);
  // Memoizado por nombre de paleta — así un `useMemo(() => createStyles(p),
  // [p])` en la pantalla que llama esto no recalcula sus estilos en cada
  // render, solo cuando el tema realmente cambia.
  return useMemo(
    () => ({ ...neutralColors, ...palettes[paletteName] }),
    [paletteName],
  );
}

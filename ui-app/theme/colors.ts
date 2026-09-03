// Tokens que NO cambian según el tema elegido por el usuario (ver
// `palettes` más abajo y `usePalette()` en stores/useThemeStore.ts) —
// legibilidad bajo sol directo (RNF-02) exige alto contraste sin importar
// qué color de marca esté activo, así que fondo/texto/bordes/estados
// semánticos quedan fijos para los cuatro temas.
export const neutralColors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  error: '#C62828',
  success: '#2E7D32',
  warning: '#F9A825',
  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  border: '#D9D9D9',
  disabled: '#BDBDBD',
} as const;

// La mayoría de las pantallas solo necesita estos tokens fijos y sigue
// importando `colors` como antes — `primary`/`primaryDark`/`secondary`
// viven aparte a propósito (ver abajo): son justo los que SÍ cambian por
// tema, así que dejarlos acá los congelaría en un solo valor estático otra
// vez (el mismo bug que tenía `theme/theme.ts` con `elevation`). Cualquier
// pantalla que necesite el color de marca activo usa `usePalette()` en vez
// de este objeto.
export const colors = neutralColors;

export type ColorToken = keyof typeof neutralColors;

// Colores de marca por tema — cada uno saturado y de alto contraste
// (mismo criterio RNF-02 de arriba), nada de tonos pasteles que se laven
// con luz fuerte. `secondary` es el acento de contraste de cada paleta, no
// necesariamente el mismo color entre temas.
export interface BrandColors {
  primary: string;
  primaryDark: string;
  secondary: string;
}

export const palettes = {
  // Actualizado del verde bosque original (#2E7D32/#1B5E20, apagado según
  // el usuario, 2026-09-03) a un verde más vivo/saturado.
  verde: { primary: '#16A34A', primaryDark: '#15803D', secondary: '#EF6C00' },
  morado: { primary: '#6750A4', primaryDark: '#4527A0', secondary: '#EF6C00' },
  azul: { primary: '#1565C0', primaryDark: '#0D47A1', secondary: '#EF6C00' },
  naranja: {
    primary: '#D84315',
    primaryDark: '#BF360C',
    secondary: '#1565C0',
  },
} as const satisfies Record<string, BrandColors>;

export type PaletteName = keyof typeof palettes;

export const DEFAULT_PALETTE: PaletteName = 'verde';

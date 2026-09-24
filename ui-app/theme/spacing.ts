// Escala de espaciado compartida — evita números mágicos de padding/margin
// repetidos por pantalla.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Tamaño mínimo de un elemento tocable en toda la app. Más grande que el
// mínimo recomendado por Material (48dp): la mano puede estar sucia o con
// guante, y el toque de "Anotar" es la acción más repetida de toda la app
// (RNF-02 — usable a una mano, bajo sol directo).
export const TOUCH_TARGET_MIN = 64;

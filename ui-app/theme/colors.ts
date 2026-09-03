// Paleta base de la app — único lugar donde se definen los colores. Ningún
// componente debería tener un color hardcodeado: todo se lee de acá (o del
// theme de Paper compuesto en theme.ts, que a su vez lee de este archivo).
//
// Pensada para RNF-02 (legibilidad bajo sol directo): colores saturados y de
// alto contraste, nada de tonos pasteles que se laven con luz fuerte.
export const colors = {
  primary: '#2E7D32', // verde campo — acción principal ("Anotar", confirmar)
  primaryDark: '#1B5E20',
  secondary: '#EF6C00', // naranja — acciones secundarias / advertencias suaves
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

export type ColorToken = keyof typeof colors;

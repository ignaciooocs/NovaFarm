import { MD3LightTheme } from 'react-native-paper';
import { colors, palettes, type PaletteName } from './colors';

// Arma el theme de Paper para un tema elegido por el usuario. Antes era un
// objeto estático (un solo `primary` fijo); ahora es una función porque
// `primary`/`secondary` cambian según la paleta activa (ver
// stores/useThemeStore.ts) — <PaperProvider> en app/_layout.tsx la llama de
// nuevo cada vez que el usuario cambia de tema en Ajustes.
export function buildTheme(paletteName: PaletteName) {
  const brand = palettes[paletteName];

  return {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: brand.primary,
      onPrimary: colors.surface,
      secondary: brand.secondary,
      onSecondary: colors.surface,
      background: colors.background,
      onBackground: colors.textPrimary,
      surface: colors.surface,
      onSurface: colors.textPrimary,
      surfaceVariant: colors.background,
      onSurfaceVariant: colors.textSecondary,
      error: colors.error,
      onError: colors.surface,
      outline: colors.border,
      // MD3LightTheme define muchos más roles de color que los de arriba
      // (primaryContainer, tertiary, inverseSurface, etc.), y varios
      // componentes de Paper los usan por defecto en vez de `primary` —
      // el ejemplo real que lo hizo evidente: el FAB ("+" de los catálogos)
      // usa `primaryContainer` para su fondo, no `primary`, así que sin
      // esto se quedaba con el lila de fábrica de MD3 sin importar el tema
      // elegido (mismo origen que el bug de `elevation` de abajo). En vez
      // de derivar un tono más pálido para cada "container" (el patrón
      // habitual de Material 3), se usa el mismo color sólido que su rol
      // base — RNF-02 pide saturado/alto contraste, nada de tonos pasteles,
      // así que un container diluido iría contra ese criterio.
      primaryContainer: brand.primary,
      onPrimaryContainer: colors.surface,
      secondaryContainer: brand.secondary,
      onSecondaryContainer: colors.surface,
      tertiary: brand.secondary,
      onTertiary: colors.surface,
      tertiaryContainer: brand.secondary,
      onTertiaryContainer: colors.surface,
      outlineVariant: colors.border,
      surfaceDisabled: colors.disabled,
      onSurfaceDisabled: colors.textSecondary,
      inverseSurface: colors.textPrimary,
      inverseOnSurface: colors.surface,
      inversePrimary: brand.primary,
      // Sin esto, Paper deja los 5 niveles con su valor de fábrica de
      // MD3LightTheme — un morado tenue mezclado sobre blanco (deriva del
      // primary morado por defecto de Material 3, no del color de marca
      // elegido acá). Componentes "elevados" (Dialog, Menu, etc.) se apoyan
      // en un Surface que pinta su fondo con este color — bug real
      // encontrado en el diálogo de "Nueva fruta" (2026-09-03). Plano en
      // vez de un tinte de color, para cualquier tema.
      elevation: {
        level0: 'transparent',
        level1: colors.surface,
        level2: colors.surface,
        level3: colors.surface,
        level4: colors.surface,
        level5: colors.surface,
      },
    },
  };
}

export type AppTheme = ReturnType<typeof buildTheme>;

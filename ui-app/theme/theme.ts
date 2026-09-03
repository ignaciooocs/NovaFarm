import { MD3LightTheme } from 'react-native-paper';
import { colors } from './colors';

// Compone la paleta de colors.ts sobre el theme de Material Design 3 de
// Paper. Este es el único objeto que se le pasa a <PaperProvider> — cambiar
// un color acá (o en colors.ts) lo cambia en toda la app de una sola vez.
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.surface,
    secondary: colors.secondary,
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
  },
};

export type AppTheme = typeof theme;

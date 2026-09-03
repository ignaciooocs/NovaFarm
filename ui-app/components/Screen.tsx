import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { spacing } from '@/theme';

const DEFAULT_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

interface ScreenProps extends PropsWithChildren {
  // Por defecto protege los 4 bordes — correcto para pantallas sin header
  // nativo (headerShown: false, la mayoría). Las que sí tienen uno (las que
  // viven bajo (drawer), con headerShown: true en Tabs/Drawer) deben pasar
  // `edges={['bottom', 'left', 'right']}` acá: el header ya empuja el
  // contenido bajo la status bar, así que proteger 'top' de nuevo deja un
  // padding doble arriba (bug real, encontrado probando).
  edges?: Edge[];
}

export function Screen({ children, edges = DEFAULT_EDGES }: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: spacing.md },
});

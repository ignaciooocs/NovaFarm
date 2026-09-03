import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { spacing } from '@/theme';

// Wrapper base para toda pantalla: respeta el área segura, aplica el fondo
// del theme y un padding consistente — así ninguna pantalla repite este
// boilerplate ni hardcodea su propio color de fondo.
export function Screen({ children }: PropsWithChildren) {
  const theme = useTheme();

  return (
    <SafeAreaView
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

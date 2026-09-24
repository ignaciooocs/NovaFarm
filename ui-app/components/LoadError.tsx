import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { strings } from '@/constants/strings';
import { colors, spacing } from '@/theme';

// Lo que queda en una pantalla que no tiene nada que mostrar porque su carga
// falló. El motivo exacto lo dice el aviso flotante (useErrorToast); acá
// queda solo la línea que explica por qué está vacía, en gris y no en rojo:
// sin señal esto es lo normal en el campo, no una falla que asuste.
export function LoadError() {
  return <Text style={styles.text}>{strings.errors.loadFailed}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});

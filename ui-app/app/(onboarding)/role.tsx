import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { spacing } from '@/theme';

// Primero el rol, después la afiliación (ver el orden de onboarding
// documentado en CLAUDE.md) — no hay un modo "recorder independiente":
// trabajar solo requiere permisos de admin sobre el propio catálogo.
export default function RoleScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.roleQuestion}
      </Text>

      <Button
        mode="contained"
        onPress={() => router.push('/create-farm')}
        style={styles.button}
      >
        {strings.onboarding.roleAdmin}
      </Button>

      <Button
        mode="outlined"
        onPress={() => router.push('/join-farm')}
        style={styles.button}
      >
        {strings.onboarding.roleRecorder}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  button: { marginBottom: spacing.md },
});

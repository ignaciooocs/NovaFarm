import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { spacing } from '@/theme';

type Role = 'admin' | 'recorder';

// Primero el rol, después la afiliación (ver el orden de onboarding
// documentado en CLAUDE.md) — no hay un modo "recorder independiente":
// trabajar solo requiere permisos de admin sobre el propio catálogo.
//
// Antes eran dos botones de ancho completo con la frase larga como label
// directamente — seguía sin leerse bien (mismo problema que tenía el
// SegmentedButtons de create-farm.tsx, un control angosto para una frase
// larga). Mismo arreglo: título corto + descripción completa en un
// OptionSelector, elegir y confirmar con un botón en vez de navegar al
// primer toque — así, si se equivoca, puede cambiar de opción antes de
// seguir sin tener que usar la flecha de volver de la siguiente pantalla.
export default function RoleScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);

  function handleContinue() {
    if (role === 'admin') {
      router.push('/create-farm');
    } else if (role === 'recorder') {
      router.push('/join-farm');
    }
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.roleQuestion}
      </Text>

      <OptionSelector
        value={role}
        onChange={setRole}
        style={styles.options}
        options={[
          {
            value: 'admin',
            short: strings.onboarding.roleAdminShort,
            description: strings.onboarding.roleAdmin,
          },
          {
            value: 'recorder',
            short: strings.onboarding.roleRecorderShort,
            description: strings.onboarding.roleRecorder,
          },
        ]}
      />

      <Button
        mode="contained"
        onPress={handleContinue}
        disabled={role === null}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.common.continue}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  options: { marginBottom: spacing.lg },
  button: { borderRadius: 12 },
  buttonContent: { paddingVertical: spacing.xs },
});

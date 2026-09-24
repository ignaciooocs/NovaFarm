import { RadioButton, Text } from 'react-native-paper';
import { StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { useActiveRoleStore, useAuthStore, type Role } from '@/stores';
import { spacing } from '@/theme';

function roleLabelFor(role: Role): string {
  if (role === 'admin') {
    return strings.admin.roleAdmin;
  }
  return role === 'supervisor'
    ? strings.admin.roleSupervisor
    : strings.admin.roleRecorder;
}

// Sistema multirol (ui-arquitectura.md §5): esta pantalla solo aparece en el
// drawer si la cuenta tiene más de un rol asignado (ver (drawer)/_layout.tsx).
// Elegir acá nunca pega a la red ni depende de conexión — es puro estado
// local (useActiveRoleStore), a propósito, para que cambiar de modo
// funcione incluso sin señal.
export default function SwitchRoleScreen() {
  const roles = useAuthStore((state) => state.claims.roles);
  const activeRole = useActiveRoleStore((state) => state.activeRole);
  const setActiveRole = useActiveRoleStore((state) => state.setActiveRole);
  const currentRole = activeRole && roles.includes(activeRole) ? activeRole : roles[0];

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.switchRole.title}
      </Text>
      <Text style={styles.subtitle}>{strings.switchRole.subtitle}</Text>

      <RadioButton.Group
        value={currentRole ?? ''}
        onValueChange={(value) => setActiveRole(value as Role)}
      >
        {roles.map((role) => (
          <RadioButton.Item
            key={role}
            label={roleLabelFor(role)}
            value={role}
          />
        ))}
      </RadioButton.Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
});

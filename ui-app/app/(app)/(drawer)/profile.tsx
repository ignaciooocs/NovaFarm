import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  usersControllerFindMe,
  usersControllerUpdateMe,
} from '@/api/generated/users/users';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

// Solo perfil propio — editar los roles o desactivar la propia cuenta no
// entra acá (mismos motivos que en UpdateUserRequestDto del lado del
// server: los roles tienen casos límite sin resolver, y active es una
// acción de un admin sobre otra cuenta, no algo que uno se hace a sí mismo).
export default function ProfileScreen() {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Array<'admin' | 'recorder' | 'supervisor'>>(
    [],
  );
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const user = await usersControllerFindMe();
        setEmail(user.email);
        setRoles(user.roles);
        setName(user.name);
        setNationalId(user.nationalId ?? '');
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleFieldChange(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setSaved(false);
    };
  }

  // nationalId vacío se manda como null explícito (no undefined) para
  // borrar uno que ya estaba guardado — ver el comentario en
  // users.service.ts (updateMe) para el motivo ($unset vs $set).
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await usersControllerUpdateMe({
        name: name.trim(),
        nationalId: nationalId.trim() || null,
      });
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const rolesLabel = roles
    .map((role) =>
      role === 'admin'
        ? strings.admin.roleAdmin
        : role === 'supervisor'
          ? strings.admin.roleSupervisor
          : strings.admin.roleRecorder,
    )
    .join(', ');

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.profile.title}
      </Text>

      <Text style={styles.readOnlyRow}>{email}</Text>
      <Text style={styles.readOnlyRow}>{rolesLabel}</Text>

      <TextInput
        label={strings.common.name}
        value={name}
        onChangeText={handleFieldChange(setName)}
        style={styles.input}
      />
      <TextInput
        label={strings.profile.nationalIdLabel}
        value={nationalId}
        onChangeText={handleFieldChange(setNationalId)}
        style={styles.input}
      />

      {error ? <HelperText type="error">{error}</HelperText> : null}
      {saved ? <HelperText type="info">{strings.profile.saved}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={!name.trim() || saving}
      >
        {strings.common.save}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  readOnlyRow: { marginBottom: spacing.xs },
  input: { marginTop: spacing.md, marginBottom: spacing.sm },
});

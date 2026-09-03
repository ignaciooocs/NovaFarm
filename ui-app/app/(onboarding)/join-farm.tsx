import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getAuth } from '@/api/generated/auth/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { spacing } from '@/theme';

export default function JoinFarmScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    name.trim().length > 0 && invitationCode.trim().length > 0 && !loading;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const { authControllerRegisterRecorder } = getAuth();
      await authControllerRegisterRecorder({
        name: name.trim(),
        invitationCode: invitationCode.trim(),
      });

      // Mismo motivo que en create-farm.tsx: forzar el refresh para que el
      // farmId/role recién asignados se reflejen en el token en memoria.
      await auth.currentUser?.getIdToken(true);

      router.replace('/home');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.joinFarmTitle}
      </Text>

      <TextInput
        label={strings.onboarding.nameLabel}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        label={strings.onboarding.invitationCodeLabel}
        value={invitationCode}
        onChangeText={setInvitationCode}
        autoCapitalize="characters"
        style={styles.input}
      />

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        disabled={!canSubmit}
        style={styles.button}
      >
        {strings.onboarding.joinFarmButton}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  input: { marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
});

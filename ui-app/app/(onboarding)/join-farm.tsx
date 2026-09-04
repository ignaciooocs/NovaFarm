import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getAuth } from '@/api/generated/auth/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

export default function JoinFarmScreen() {
  const router = useRouter();
  const palette = usePalette();
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
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.onboarding.joinFarmTitle }}
      />

      <Text style={styles.subtitle}>{strings.onboarding.joinFarmSubtitle}</Text>

      <TextInput
        mode="outlined"
        label={strings.onboarding.nameLabel}
        value={name}
        onChangeText={setName}
        left={<TextInput.Icon icon="account-outline" />}
        outlineColor={colors.border}
        activeOutlineColor={palette.primary}
        style={styles.input}
      />
      <TextInput
        mode="outlined"
        label={strings.onboarding.invitationCodeLabel}
        value={invitationCode}
        onChangeText={setInvitationCode}
        autoCapitalize="characters"
        left={<TextInput.Icon icon="key-outline" />}
        outlineColor={colors.border}
        activeOutlineColor={palette.primary}
        style={styles.input}
      />

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        disabled={!canSubmit}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.onboarding.joinFarmButton}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  input: { marginBottom: spacing.md },
  buttonContent: { paddingVertical: spacing.xs },
  button: { marginTop: spacing.sm, borderRadius: 12 },
});

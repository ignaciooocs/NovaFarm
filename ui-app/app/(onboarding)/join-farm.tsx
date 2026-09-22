import { useState } from 'react';
import { Share, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Text, TextInput } from 'react-native-paper';
import { useAuthControllerRegisterRecorder } from '@/api/generated/auth/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { isExpiredInvitationCodeError } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { useErrorToast, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

export default function JoinFarmScreen() {
  const router = useRouter();
  const palette = usePalette();
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  // Lo que sigue al registro va en el onSuccess del hook y no en el de
  // mutate() (ver create-farm.tsx).
  const registerRecorder = useAuthControllerRegisterRecorder({
    mutation: {
      onSuccess: async () => {
        // Mismo motivo que en create-farm.tsx: forzar el refresh para que el
        // farmId/role recién asignados se reflejen en el token en memoria.
        await auth.currentUser?.getIdToken(true);

        router.replace('/home');
      },
    },
  });

  // El aviso flota; lo que sí se queda en la pantalla es el botón de pedir
  // un código nuevo cuando el que escribió está vencido (ver abajo): eso es
  // la salida, no el error.
  useErrorToast(registerRecorder.error);

  const canSubmit =
    name.trim().length > 0 &&
    invitationCode.trim().length > 0 &&
    !registerRecorder.isPending;

  function handleSubmit() {
    registerRecorder.mutate({
      data: { name: name.trim(), invitationCode: invitationCode.trim() },
    });
  }

  // Con el código vencido, pedir otro es mandarle un mensaje a quien invitó
  // por la app que se elija (share sheet): quien se une todavía no es parte
  // de ninguna farm, así que no hay a quién avisarle dentro de la app.
  async function handleRequestNewCode() {
    try {
      await Share.share({ message: strings.onboarding.requestNewCodeMessage });
    } catch {
      // Canceló el share sheet — no es un error real, mismo criterio que
      // invite-code.tsx.
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

      {isExpiredInvitationCodeError(registerRecorder.error) ? (
        <Button
          mode="text"
          icon="message-text-outline"
          onPress={handleRequestNewCode}
          textColor={palette.primary}
          style={styles.requestButton}
        >
          {strings.onboarding.requestNewCode}
        </Button>
      ) : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={registerRecorder.isPending}
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
  requestButton: { alignSelf: 'flex-start' },
});

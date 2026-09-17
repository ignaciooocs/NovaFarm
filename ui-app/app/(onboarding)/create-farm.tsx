import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useAuthControllerRegisterAdmin } from '@/api/generated/auth/auth';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

type FarmType = 'organization' | 'independent';

export default function CreateFarmScreen() {
  const router = useRouter();
  const palette = usePalette();
  const [name, setName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [farmType, setFarmType] = useState<FarmType>('organization');

  // Lo que sigue al registro va en el onSuccess del hook y no en el de
  // mutate(): la farm ya quedó creada en el server, así que el refresco del
  // token tiene que correr aunque se haya vuelto atrás mientras registraba
  // (mismo motivo que en workday/[id]/close.tsx).
  const registerAdmin = useAuthControllerRegisterAdmin({
    mutation: {
      onSuccess: async (result, { data }) => {
        // Los custom claims (farmId/role) recién quedaron seteados en
        // Firebase — el ID token que tenemos en memoria es anterior a eso.
        // Sin este refresh, tanto el redirect de app/index.tsx como
        // FarmScopeGuard del lado del server seguirían viendo el token viejo.
        await auth.currentUser?.getIdToken(true);

        if (data.farmType === 'organization') {
          router.replace({
            pathname: '/invite-code',
            params: { code: result.farm.invitationCode },
          });
        } else {
          router.replace('/starter-products');
        }
      },
    },
  });

  const canSubmit =
    name.trim().length > 0 &&
    farmName.trim().length > 0 &&
    !registerAdmin.isPending;

  function handleSubmit() {
    registerAdmin.mutate({
      data: { name: name.trim(), farmName: farmName.trim(), farmType },
    });
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: strings.onboarding.createFarmTitle,
        }}
      />

      <Text style={styles.subtitle}>{strings.onboarding.createFarmSubtitle}</Text>

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
        label={strings.onboarding.farmNameLabel}
        value={farmName}
        onChangeText={setFarmName}
        left={<TextInput.Icon icon="sprout-outline" />}
        outlineColor={colors.border}
        activeOutlineColor={palette.primary}
        style={styles.input}
      />

      <Text variant="labelLarge" style={styles.optionsLabel}>
        {strings.onboarding.farmTypeQuestion}
      </Text>
      <OptionSelector
        value={farmType}
        onChange={setFarmType}
        style={styles.optionsGroup}
        options={[
          {
            value: 'organization',
            short: strings.onboarding.farmTypeOrganizationShort,
            description: strings.onboarding.farmTypeOrganization,
          },
          {
            value: 'independent',
            short: strings.onboarding.farmTypeIndependentShort,
            description: strings.onboarding.farmTypeIndependent,
          },
        ]}
      />

      {registerAdmin.error ? (
        <HelperText type="error">
          {getErrorMessage(registerAdmin.error)}
        </HelperText>
      ) : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={registerAdmin.isPending}
        disabled={!canSubmit}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.onboarding.createFarmButton}
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
  optionsLabel: { marginBottom: spacing.xs, color: colors.textSecondary },
  optionsGroup: { marginBottom: spacing.md },
  buttonContent: { paddingVertical: spacing.xs },
  button: { marginTop: spacing.sm, borderRadius: 12 },
});

import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { isAxiosError } from 'axios';
import { useRouter } from 'expo-router';
import { Button, HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { getAuth } from '@/api/generated/auth/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { spacing } from '@/theme';

export default function CreateFarmScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [farmType, setFarmType] = useState<'organization' | 'independent'>(
    'organization',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    name.trim().length > 0 && farmName.trim().length > 0 && !loading;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const { authControllerRegisterAdmin } = getAuth();
      const result = await authControllerRegisterAdmin({
        name: name.trim(),
        farmName: farmName.trim(),
        farmType,
      });

      // Los custom claims (farmId/role) recién quedaron seteados en
      // Firebase — el ID token que tenemos en memoria es anterior a eso.
      // Sin este refresh, tanto el redirect de app/index.tsx como
      // FarmScopeGuard del lado del server seguirían viendo el token viejo.
      await auth.currentUser?.getIdToken(true);

      if (farmType === 'organization') {
        router.replace({
          pathname: '/invite-code',
          params: { code: result.farm.invitationCode },
        });
      } else {
        router.replace('/home');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      // Temporal: confirma la URL exacta que se pidió y qué contestó el
      // servidor — se saca una vez que el 404 esté diagnosticado.
      if (isAxiosError(err)) {
        console.log('Request URL:', (err.config?.baseURL ?? '') + (err.config?.url ?? ''));
        console.log('Response data:', err.response?.data);
      }
      console.log('Error creating farm:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.farmNameLabel}
      </Text>

      <TextInput
        label={strings.onboarding.nameLabel}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        label={strings.onboarding.farmNameLabel}
        value={farmName}
        onChangeText={setFarmName}
        style={styles.input}
      />

      <SegmentedButtons
        value={farmType}
        onValueChange={(value) =>
          setFarmType(value as 'organization' | 'independent')
        }
        buttons={[
          {
            value: 'organization',
            label: strings.onboarding.farmTypeOrganization,
          },
          {
            value: 'independent',
            label: strings.onboarding.farmTypeIndependent,
          },
        ]}
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
        {strings.onboarding.createFarmButton}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  input: { marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
});

import { StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { spacing } from '@/theme';

export default function InviteCodeScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.invitationCodeLabel}
      </Text>
      <Text style={styles.subtitle}>{strings.onboarding.invitationCodeShare}</Text>

      <Text variant="displayMedium" style={styles.code}>
        {code}
      </Text>

      <Button
        mode="contained"
        onPress={() => router.replace('/home')}
        style={styles.button}
      >
        {strings.common.continue}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
  code: { textAlign: 'center', letterSpacing: 4, marginBottom: spacing.xl },
  button: { marginTop: spacing.sm },
});

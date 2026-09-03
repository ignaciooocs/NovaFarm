import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { signOut } from 'firebase/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { auth } from '@/lib/firebase';
import { spacing } from '@/theme';

// Sigue siendo un placeholder (la jornada activa / historial se construyen
// en la siguiente tarea) — el logout ya es real para poder probar el ciclo
// completo de auth/onboarding de punta a punta.
export default function HomeScreen() {
  const router = useRouter();

  async function handleLogout() {
    await signOut(auth);
    router.replace('/');
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.home.title}
      </Text>

      <Button mode="outlined" onPress={handleLogout}>
        {strings.settings.logout}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
});

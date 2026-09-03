import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { signOut } from 'firebase/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getActiveWorkday } from '@/db/queries';
import { auth } from '@/lib/firebase';
import { useActiveWorkdayStore, useAuthStore } from '@/stores';
import { spacing } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const uid = useAuthStore((state) => state.user?.uid);
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // useFocusEffect: al volver de cerrar/abrir una jornada (u otra pantalla)
  // Home sigue montado en el stack, hay que revisar de nuevo cada vez que
  // vuelve a tener foco, no solo al montarse.
  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        return;
      }

      let cancelled = false;

      (async () => {
        setLoading(true);
        const workday = await getActiveWorkday(uid);
        if (cancelled) {
          return;
        }
        setActiveId(workday?.id ?? null);
        setActiveWorkdayId(workday?.id ?? null);
        setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [uid, setActiveWorkdayId]),
  );

  async function handleLogout() {
    await signOut(auth);
    router.replace('/');
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.home.title}
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.button} />
      ) : activeId ? (
        <Button
          mode="contained"
          onPress={() =>
            router.push({
              pathname: '/workday/[id]/anotador',
              params: { id: activeId },
            })
          }
          style={styles.button}
        >
          {strings.home.activeWorkday}
        </Button>
      ) : (
        <Button
          mode="contained"
          onPress={() => router.push('/open-workday')}
          style={styles.button}
        >
          {strings.home.openWorkday}
        </Button>
      )}

      <Button
        mode="contained-tonal"
        onPress={() => router.push('/fruits')}
        style={styles.button}
      >
        {strings.admin.fruitsTitle}
      </Button>
      <Button
        mode="contained-tonal"
        onPress={() => router.push('/measurement-units')}
        style={styles.button}
      >
        {strings.admin.measurementUnitsTitle}
      </Button>
      <Button
        mode="contained-tonal"
        onPress={() => router.push('/harvesters')}
        style={styles.button}
      >
        {strings.admin.harvestersTitle}
      </Button>

      <Button mode="outlined" onPress={handleLogout} style={styles.logout}>
        {strings.settings.logout}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  button: { marginBottom: spacing.md },
  logout: { marginTop: spacing.lg },
});

import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getActiveWorkday } from '@/db/queries';
import { syncCatalogs } from '@/lib/catalogSync';
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

      // Fire-and-forget: Home es el punto natural "ya-online" del ciclo (se
      // visita al iniciar sesión y al volver de cada jornada) para refrescar
      // la caché local de catálogos — no bloquea el render de Home ni
      // depende de que termine para mostrar la jornada activa.
      syncCatalogs();

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

  return (
    <Screen edges={['bottom', 'left', 'right']}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  button: { marginBottom: spacing.md },
});

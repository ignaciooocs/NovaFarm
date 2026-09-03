import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, HelperText, List, Text } from 'react-native-paper';
import type { FindWorkdayResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { fruits } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

// Lista de jornadas cerradas de la farm. Es una acción online igual que los
// catálogos de admin (no RF-01: una jornada ya cerrada no es captura en
// terreno) — se pide en vivo cada vez. Los nombres de fruta sí se resuelven
// contra la caché local (lib/catalogSync.ts) en vez de otro pedido en vivo,
// ya que fruits guarda el catálogo completo (activas e inactivas), y una
// jornada vieja puede apuntar a una fruta que ya se desactivó.
export default function HistoryScreen() {
  const [workdays, setWorkdays] = useState<FindWorkdayResponseDto[]>([]);
  const [fruitNamesById, setFruitNamesById] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        setLoading(true);
        setError(null);
        try {
          const { workdaysControllerFindAll } = getWorkdays();
          const [closedWorkdays, fruitRows] = await Promise.all([
            workdaysControllerFindAll({ status: 'CLOSED' }),
            db.select().from(fruits),
          ]);
          if (cancelled) {
            return;
          }

          const namesById: Record<string, string> = {};
          fruitRows.forEach((fruit) => {
            namesById[fruit.id] = fruit.name;
          });
          setFruitNamesById(namesById);

          setWorkdays(
            [...closedWorkdays].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            ),
          );
        } catch (err) {
          if (!cancelled) {
            setError(getErrorMessage(err));
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.home.history}
      </Text>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={workdays}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={fruitNamesById[item.fruitId] ?? item.fruitId}
              description={`${new Date(item.date).toLocaleDateString('es-CL')} · ${(item.finalTotalKg ?? 0).toFixed(2)} ${strings.anotador.kg}`}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
});

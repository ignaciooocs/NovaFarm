import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { and, eq } from 'drizzle-orm';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Button, HelperText, Text } from 'react-native-paper';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_FRUIT_ICON } from '@/constants/fruitIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { fruits, harvestEntries, harvesterWorkday, workdays } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

type WorkdayRow = typeof workdays.$inferSelect;

// Cerrar es una acción online, igual que abrir: el total definitivo lo
// congela el server sumando lo que ya tiene sincronizado. Por eso, si queda
// algo pendiente de subir, esta pantalla no deja cerrar — lo manda primero
// a Sincronizar, para que el total congelado no quede incompleto.
export default function CloseWorkdayScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();

  const [workday, setWorkday] = useState<WorkdayRow | null>(null);
  const [fruitName, setFruitName] = useState('');
  const [fruitIcon, setFruitIcon] = useState(DEFAULT_FRUIT_ICON);
  const [pendingCount, setPendingCount] = useState(0);
  const [localTotalKg, setLocalTotalKg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [row] = await db
          .select()
          .from(workdays)
          .where(eq(workdays.id, workdayId));
        setWorkday(row ?? null);
        if (!row) {
          return;
        }

        const [fruitRow, pendingRoster, pendingEntries, allEntries] =
          await Promise.all([
            db.select().from(fruits).where(eq(fruits.id, row.fruitId)),
            db
              .select()
              .from(harvesterWorkday)
              .where(
                and(
                  eq(harvesterWorkday.workdayId, workdayId),
                  eq(harvesterWorkday.synced, false),
                ),
              ),
            db
              .select()
              .from(harvestEntries)
              .where(
                and(
                  eq(harvestEntries.workdayId, workdayId),
                  eq(harvestEntries.synced, false),
                ),
              ),
            db
              .select()
              .from(harvestEntries)
              .where(eq(harvestEntries.workdayId, workdayId)),
          ]);

        setFruitName(fruitRow[0]?.name ?? '');
        setFruitIcon(fruitRow[0]?.icon ?? DEFAULT_FRUIT_ICON);
        // La jornada misma cuenta como pendiente si se abrió sin conexión y
        // todavía no subió: sin esto, handleClose() se topa con su propio
        // `return` por falta de serverId y el botón no hace nada sin
        // explicar por qué.
        setPendingCount(
          (row.synced ? 0 : 1) + pendingRoster.length + pendingEntries.length,
        );
        setLocalTotalKg(
          allEntries.reduce((sum, entry) => sum + entry.totalKg, 0),
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [workdayId]);

  async function handleClose() {
    if (!workday?.serverId) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      const { workdaysControllerClose } = getWorkdays();
      const result = await workdaysControllerClose(workday.serverId);

      await db
        .update(workdays)
        .set({
          status: 'CLOSED',
          finalTotalKg: result.finalTotalKg ?? null,
        })
        .where(eq(workdays.id, workdayId));

      router.replace('/home');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.workday.closeTitle }}
      />

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : !workday ? (
        <Text>{strings.errors.generic}</Text>
      ) : (
        <>
          <Text variant="titleLarge" style={styles.fruitName}>
            {fruitIcon} {fruitName}
          </Text>
          <Text style={styles.dateText}>
            {new Date(workday.date).toLocaleDateString('es-CL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>

          <View
            style={[styles.totalCard, { backgroundColor: palette.primarySoft }]}
          >
            <Text style={styles.totalLabel}>{strings.workday.totalKg}</Text>
            <Text style={[styles.totalValue, { color: palette.primary }]}>
              {localTotalKg.toFixed(2)}
              <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
            </Text>
          </View>

          {pendingCount > 0 ? (
            <View style={styles.blockedState}>
              <MaterialCommunityIcons
                name="cloud-alert-outline"
                size={40}
                color={colors.warning}
              />
              <Text style={styles.blockedText}>
                {strings.workday.pendingBeforeClose(pendingCount)}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.push('/sync')}
                style={styles.button}
              >
                {strings.sync.title}
              </Button>
            </View>
          ) : (
            <View style={styles.confirmState}>
              <Text style={styles.confirmText}>
                {strings.workday.closeConfirm}
              </Text>
              {error ? <HelperText type="error">{error}</HelperText> : null}
              <Button
                mode="contained"
                onPress={handleClose}
                loading={closing}
                disabled={closing}
                style={styles.button}
              >
                {strings.workday.close}
              </Button>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  fruitName: { fontWeight: '700' },
  dateText: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textTransform: 'capitalize',
  },
  totalCard: {
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  totalLabel: { color: colors.textSecondary, fontSize: 13 },
  totalValue: {
    fontWeight: '800',
    fontSize: 36,
    lineHeight: 42,
  },
  totalUnit: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  blockedState: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  blockedText: { color: colors.textSecondary, textAlign: 'center' },
  confirmState: { gap: spacing.sm },
  confirmText: { color: colors.textSecondary },
  button: { marginTop: spacing.md, alignSelf: 'stretch' },
});

import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { and, eq } from 'drizzle-orm';
import { ActivityIndicator, Button, HelperText, Text } from 'react-native-paper';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvestEntries, harvesterWorkday, workdays } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

type WorkdayRow = typeof workdays.$inferSelect;

// Cerrar es una acción online, igual que abrir: el total definitivo lo
// congela el server sumando lo que ya tiene sincronizado. Por eso, si queda
// algo pendiente de subir, esta pantalla no deja cerrar — lo manda primero
// a Sincronizar, para que el total congelado no quede incompleto.
export default function CloseWorkdayScreen() {
  const router = useRouter();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();

  const [workday, setWorkday] = useState<WorkdayRow | null>(null);
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

        const [pendingRoster, pendingEntries, allEntries] = await Promise.all(
          [
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
          ],
        );

        setPendingCount(pendingRoster.length + pendingEntries.length);
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

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!workday) {
    return (
      <Screen>
        <Text>{strings.errors.generic}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.workday.closeTitle}
      </Text>
      <Text variant="titleMedium" style={styles.total}>
        {strings.workday.totalKg}: {localTotalKg.toFixed(2)}{' '}
        {strings.anotador.kg}
      </Text>

      {pendingCount > 0 ? (
        <>
          <HelperText type="error" visible style={styles.pendingWarning}>
            {strings.workday.pendingBeforeClose(pendingCount)}
          </HelperText>
          <Button mode="contained" onPress={() => router.push('/sync')}>
            {strings.sync.title}
          </Button>
        </>
      ) : (
        <>
          <Text style={styles.confirm}>{strings.workday.closeConfirm}</Text>
          {error ? <HelperText type="error">{error}</HelperText> : null}
          <Button
            mode="contained"
            onPress={handleClose}
            loading={closing}
            disabled={closing}
          >
            {strings.workday.close}
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.sm },
  total: { marginBottom: spacing.lg },
  confirm: { marginBottom: spacing.md },
  pendingWarning: { marginBottom: spacing.md },
});

import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { and, eq } from 'drizzle-orm';
import { ActivityIndicator, Button, List, Text } from 'react-native-paper';
import { getHarvestEntries } from '@/api/generated/harvest-entries/harvest-entries';
import { getHarvesterWorkday } from '@/api/generated/harvester-workday/harvester-workday';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import { harvestEntries, harvesterWorkday } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore, useConnectivityStore } from '@/stores';
import { spacing } from '@/theme';

// Sube en batch lo que quedó guardado local (harvesterWorkday primero,
// después harvestEntries — el server valida que el cosechador ya esté en
// el roster antes de aceptar una entrega suya, así que el orden importa).
// No hace chunking todavía (el server acepta hasta 500 por lote) — para el
// volumen de una sola jornada alcanza con un solo batch; si algún día hace
// falta trabajar con miles de registros pendientes, ahí sí habría que
// partirlo.
export default function SyncScreen() {
  const uid = useAuthStore((state) => state.user?.uid);
  const isConnected = useConnectivityStore((state) => state.isConnected);

  const [workday, setWorkday] = useState<{
    id: string;
    serverId: string | null;
  } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectedReasons, setRejectedReasons] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!uid) {
      return;
    }
    setLoading(true);
    try {
      const activeWorkday = await getActiveWorkday(uid);
      setWorkday(
        activeWorkday
          ? { id: activeWorkday.id, serverId: activeWorkday.serverId }
          : null,
      );

      if (activeWorkday) {
        const [rosterRows, entryRows] = await Promise.all([
          db
            .select()
            .from(harvesterWorkday)
            .where(
              and(
                eq(harvesterWorkday.workdayId, activeWorkday.id),
                eq(harvesterWorkday.synced, false),
              ),
            ),
          db
            .select()
            .from(harvestEntries)
            .where(
              and(
                eq(harvestEntries.workdayId, activeWorkday.id),
                eq(harvestEntries.synced, false),
              ),
            ),
        ]);
        setPendingCount(rosterRows.length + entryRows.length);
      } else {
        setPendingCount(0);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSync() {
    if (!workday?.serverId) {
      return;
    }

    setSyncing(true);
    setError(null);
    setRejectedReasons([]);

    try {
      const rosterRows = await db
        .select()
        .from(harvesterWorkday)
        .where(
          and(
            eq(harvesterWorkday.workdayId, workday.id),
            eq(harvesterWorkday.synced, false),
          ),
        );
      const entryRows = await db
        .select()
        .from(harvestEntries)
        .where(
          and(
            eq(harvestEntries.workdayId, workday.id),
            eq(harvestEntries.synced, false),
          ),
        );

      const reasons: string[] = [];

      if (rosterRows.length > 0) {
        const { harvesterWorkdayControllerSync } = getHarvesterWorkday();
        const results = await harvesterWorkdayControllerSync({
          workdayId: workday.serverId,
          entries: rosterRows.map((row) => ({
            clientEntryId: row.id,
            harvesterId: row.harvesterId,
            workdayNumber: row.workdayNumber,
          })),
        });

        for (const result of results) {
          if (result.status === 'rejected') {
            reasons.push(result.reason ?? strings.errors.generic);
          } else {
            await db
              .update(harvesterWorkday)
              .set({ synced: true })
              .where(eq(harvesterWorkday.id, result.clientEntryId));
          }
        }
      }

      if (entryRows.length > 0) {
        const { harvestEntriesControllerSync } = getHarvestEntries();
        const results = await harvestEntriesControllerSync({
          workdayId: workday.serverId,
          entries: entryRows.map((row) => ({
            clientEntryId: row.id,
            harvesterId: row.harvesterId,
            measurementUnitId: row.measurementUnitId,
            unitCount: row.unitCount,
            recordedAt: row.recordedAt,
          })),
        });

        for (const result of results) {
          if (result.status === 'rejected') {
            reasons.push(result.reason ?? strings.errors.generic);
          } else {
            await db
              .update(harvestEntries)
              .set({ synced: true })
              .where(eq(harvestEntries.id, result.clientEntryId));
          }
        }
      }

      setRejectedReasons(reasons);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.sync.title}
      </Text>

      <Text style={styles.connectivity}>
        {isConnected ? '🟢 Conectado' : '🔴 Sin conexión'}
      </Text>

      {!workday ? (
        <Text>{strings.home.noActiveWorkday}</Text>
      ) : (
        <>
          <Text variant="titleMedium" style={styles.pending}>
            {pendingCount === 0
              ? strings.sync.synced
              : strings.sync.pendingCount(pendingCount)}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {rejectedReasons.length > 0 ? (
            <>
              <Text style={styles.error}>{strings.sync.rejectedItems}</Text>
              {rejectedReasons.map((reason, index) => (
                <List.Item key={index} title={reason} />
              ))}
            </>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSync}
            loading={syncing}
            disabled={pendingCount === 0 || syncing || !isConnected}
            style={styles.button}
          >
            {syncing ? strings.sync.syncing : strings.sync.syncButton}
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.sm },
  connectivity: { marginBottom: spacing.lg },
  pending: { marginBottom: spacing.md },
  error: { color: '#C62828', marginBottom: spacing.sm },
  button: { marginTop: spacing.md },
});

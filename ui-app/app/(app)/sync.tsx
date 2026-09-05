import { useCallback, useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { and, eq } from 'drizzle-orm';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { getHarvestEntries } from '@/api/generated/harvest-entries/harvest-entries';
import { getHarvesterWorkday } from '@/api/generated/harvester-workday/harvester-workday';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import { harvesters, harvestEntries, harvesterWorkday } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { pushPendingHarvesters } from '@/lib/harvesterSync';
import { useAuthStore, useConnectivityStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

interface PendingCounts {
  harvesters: number;
  roster: number;
  entries: number;
}

const EMPTY_PENDING: PendingCounts = { harvesters: 0, roster: 0, entries: 0 };

// Sube en batch lo que quedó guardado local: cosechadores nuevos primero
// (pushPendingHarvesters, farm-wide — ver lib/harvesterSync.ts), después
// harvesterWorkday, después harvestEntries. El orden importa en ambos
// saltos: el roster necesita que cualquier cosechador nuevo ya tenga su id
// real antes de subir, y las entregas necesitan que el cosechador ya esté
// en el roster. No hace chunking todavía (el server acepta hasta 500 por
// lote) — para el volumen de una sola jornada alcanza con un solo batch; si
// algún día hace falta trabajar con miles de registros pendientes, ahí sí
// habría que partirlo.
export default function SyncScreen() {
  const uid = useAuthStore((state) => state.user?.uid);
  const isConnected = useConnectivityStore((state) => state.isConnected);
  const palette = usePalette();

  const [workday, setWorkday] = useState<{
    id: string;
    serverId: string | null;
  } | null>(null);
  const [pending, setPending] = useState<PendingCounts>(EMPTY_PENDING);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectedReasons, setRejectedReasons] = useState<string[]>([]);

  const totalPending = pending.harvesters + pending.roster + pending.entries;

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

      // Cosechadores registrados offline pendientes de subir — farm-wide,
      // no por jornada (ver lib/harvesterSync.ts).
      const farmId = useAuthStore.getState().claims.farmId;
      const pendingHarvesterRows = farmId
        ? await db
            .select()
            .from(harvesters)
            .where(
              and(eq(harvesters.synced, false), eq(harvesters.farmId, farmId)),
            )
        : [];

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
        // Un cosechador registrado en terreno se agrega a la jornada en el
        // mismo toque (quickRegister -> addToRoster), así que aparecía en
        // los dos grupos: "3 cosechadores nuevos" + "3 agregados a la
        // jornada", las mismas 3 personas contadas dos veces (reportado
        // probando en dispositivo). Se descuentan del segundo grupo: cada
        // persona se cuenta una sola vez, en el grupo más específico.
        const pendingHarvesterIds = new Set(
          pendingHarvesterRows.map((harvester) => harvester.id),
        );
        setPending({
          harvesters: pendingHarvesterRows.length,
          roster: rosterRows.filter(
            (row) => !pendingHarvesterIds.has(row.harvesterId),
          ).length,
          entries: entryRows.length,
        });
      } else {
        setPending({ ...EMPTY_PENDING, harvesters: pendingHarvesterRows.length });
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
      const reasons: string[] = [];

      // Cosechadores nuevos primero — el roster/las entregas de abajo
      // necesitan que ya tengan su id real antes de subir (ver
      // lib/harvesterSync.ts).
      const { rejectedReasons: harvesterRejections } =
        await pushPendingHarvesters();
      reasons.push(...harvesterRejections);

      const [rosterRows, entryRows, stillPendingHarvesters] =
        await Promise.all([
          db
            .select()
            .from(harvesterWorkday)
            .where(
              and(
                eq(harvesterWorkday.workdayId, workday.id),
                eq(harvesterWorkday.synced, false),
              ),
            ),
          db
            .select()
            .from(harvestEntries)
            .where(
              and(
                eq(harvestEntries.workdayId, workday.id),
                eq(harvestEntries.synced, false),
              ),
            ),
          db
            .select({ id: harvesters.id })
            .from(harvesters)
            .where(eq(harvesters.synced, false)),
        ]);

      // Caso raro (harvesterRejections no vacío): una fila de roster/entregas
      // todavía referencia el id local de un cosechador que no pudo
      // sincronizar recién — no se puede subir así (el server la rechazaría,
      // no es un ObjectId real). Se deja pendiente para el próximo intento.
      const stillPendingIds = new Set(stillPendingHarvesters.map((h) => h.id));
      const syncableRosterRows = rosterRows.filter(
        (row) => !stillPendingIds.has(row.harvesterId),
      );
      const syncableEntryRows = entryRows.filter(
        (row) => !stillPendingIds.has(row.harvesterId),
      );

      if (syncableRosterRows.length > 0) {
        const { harvesterWorkdayControllerSync } = getHarvesterWorkday();
        const results = await harvesterWorkdayControllerSync({
          workdayId: workday.serverId,
          entries: syncableRosterRows.map((row) => ({
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

      if (syncableEntryRows.length > 0) {
        const { harvestEntriesControllerSync } = getHarvestEntries();
        const results = await harvestEntriesControllerSync({
          workdayId: workday.serverId,
          entries: syncableEntryRows.map((row) => ({
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

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, title: strings.sync.title }} />

      <View style={styles.headerRow}>
        <Text style={styles.subtitle}>{strings.sync.subtitle}</Text>
        <View
          style={[
            styles.connectivityBadge,
            {
              backgroundColor: isConnected
                ? `${colors.success}1F`
                : `${colors.error}1F`,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={isConnected ? 'wifi' : 'wifi-off'}
            size={14}
            color={isConnected ? colors.success : colors.error}
          />
          <Text
            style={[
              styles.connectivityText,
              { color: isConnected ? colors.success : colors.error },
            ]}
          >
            {isConnected ? 'Conectado' : 'Sin conexión'}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : !workday ? (
        <Text style={styles.emptyText}>{strings.home.noActiveWorkday}</Text>
      ) : (
        <>
          {totalPending === 0 ? (
            <View style={styles.successState}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={40}
                color={colors.success}
              />
              <Text
                variant="titleMedium"
                style={[styles.successTitle, { color: colors.success }]}
              >
                {strings.sync.synced}
              </Text>
              <Text style={styles.successHelp}>{strings.sync.syncedHelp}</Text>
            </View>
          ) : (
            <View style={styles.pendingSection}>
              <Text style={styles.sectionLabel}>
                {strings.sync.pendingSectionTitle}
              </Text>
              {pending.harvesters > 0 ? (
                <PendingRow
                  icon="account-plus-outline"
                  label={strings.sync.pendingHarvesters(pending.harvesters)}
                  color={palette.primary}
                />
              ) : null}
              {pending.roster > 0 ? (
                <PendingRow
                  icon="account-multiple-outline"
                  label={strings.sync.pendingRoster(pending.roster)}
                  color={palette.primary}
                />
              ) : null}
              {pending.entries > 0 ? (
                <PendingRow
                  icon="basket-outline"
                  label={strings.sync.pendingEntries(pending.entries)}
                  color={palette.primary}
                />
              ) : null}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {rejectedReasons.length > 0 ? (
            <View style={styles.rejectedSection}>
              <Text style={styles.error}>{strings.sync.rejectedItems}</Text>
              {rejectedReasons.map((reason, index) => (
                <View key={index} style={styles.rejectedRow}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.error}
                  />
                  <Text style={styles.rejectedText}>{reason}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSync}
            loading={syncing}
            disabled={totalPending === 0 || syncing || !isConnected}
            style={styles.button}
          >
            {syncing ? strings.sync.syncing : strings.sync.syncButton}
          </Button>
        </>
      )}
    </Screen>
  );
}

function PendingRow({
  icon,
  label,
  color,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
}) {
  return (
    <View style={styles.pendingRow}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={styles.pendingRowText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  subtitle: { flex: 1, color: colors.textSecondary },
  connectivityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  connectivityText: { fontSize: 12, fontWeight: '700' },
  loading: { marginTop: spacing.xl },
  emptyText: { color: colors.textSecondary },
  successState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  successTitle: { fontWeight: '700' },
  successHelp: { color: colors.textSecondary },
  pendingSection: { marginBottom: spacing.md },
  sectionLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pendingRowText: { color: colors.textPrimary },
  error: { color: colors.error, marginBottom: spacing.sm },
  rejectedSection: { marginBottom: spacing.md },
  rejectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rejectedText: { flex: 1, color: colors.textSecondary },
  button: { marginTop: spacing.md },
});

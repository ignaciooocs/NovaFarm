import { useCallback, useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { and, eq } from 'drizzle-orm';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import {
  harvestEntriesControllerSync,
} from '@/api/generated/harvest-entries/harvest-entries';
import {
  harvesterWorkdayControllerSync,
} from '@/api/generated/harvester-workday/harvester-workday';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import {
  harvesters,
  harvestEntries,
  harvesterWorkday,
  workdays,
} from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { roundToOneDecimal } from '@/lib/format';
import { pushPendingHarvesters } from '@/lib/harvesterSync';
import { startSyncLog, summarizeBatch } from '@/lib/syncLog';
import { pushPendingWorkdays } from '@/lib/workdaySync';
import { useAuthStore, useConnectivityStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

interface PendingCounts {
  workday: number;
  harvesters: number;
  roster: number;
  entries: number;
}

// Cuántas anotaciones van por request. El server resuelve cada lote en un
// puñado de consultas (sin importar su tamaño), así que esto no es por
// velocidad: es para que un día grande no viaje en una sola request enorme
// —el cliente corta a los 15s y Express tiene un límite de tamaño de body— y
// sobre todo para **guardar el avance**. Si el cuarto lote falla, los tres
// anteriores ya quedaron marcados como sincronizados y el reintento arranca
// desde ahí en vez de empezar de cero.
const ENTRY_SYNC_CHUNK = 100;

const EMPTY_PENDING: PendingCounts = {
  workday: 0,
  harvesters: 0,
  roster: 0,
  entries: 0,
};

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

  const totalPending =
    pending.workday + pending.harvesters + pending.roster + pending.entries;

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
      const pendingWorkday = activeWorkday && !activeWorkday.synced ? 1 : 0;

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
          workday: pendingWorkday,
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
    if (!workday) {
      return;
    }

    setSyncing(true);
    setError(null);
    setRejectedReasons([]);

    // Log de la saga completa, etapa por etapa (ver lib/syncLog.ts): es lo
    // que después permite reconstruir dónde se cortó una sincronización que
    // alguien reporta desde el campo. Se crea fuera del try porque el catch
    // también tiene que poder cerrarlo — mientras esté abierto, cada
    // petición sale marcada con su id.
    const log = startSyncLog(
      `jornada ${workday.id} · ${pending.harvesters} cosechadores, ${pending.roster} en roster, ${pending.entries} anotaciones`,
    );

    try {
      const reasons: string[] = [];

      // Orden obligatorio, de afuera hacia adentro: la jornada primero
      // (roster y entregas mandan su `workdayId` y el server lo valida con
      // @IsMongoId(), así que necesitan el _id real), después los
      // cosechadores nuevos (misma razón para `harvesterId`), y recién ahí
      // el roster y las entregas. Jornada y cosechadores son independientes
      // entre sí: si una falla, la otra igual sube.
      const { synced: workdaysSynced, rejectedReasons: workdayRejections } =
        await pushPendingWorkdays();
      reasons.push(...workdayRejections);
      log.step(
        'jornada',
        workdayRejections.length > 0
          ? `${workdaysSynced} subida(s), ${workdayRejections.length} rechazada(s)`
          : workdaysSynced > 0
            ? `${workdaysSynced} subida(s)`
            : 'nada pendiente',
      );

      const {
        results: harvesterResults,
        rejectedReasons: harvesterRejections,
      } = await pushPendingHarvesters();
      reasons.push(...harvesterRejections);
      log.step(
        'cosechadores',
        harvesterResults.length > 0
          ? summarizeBatch(harvesterResults)
          : 'nada pendiente',
      );

      // Releído de la base: pushPendingWorkdays() acaba de escribirle el
      // serverId. Si sigue sin él (la jornada no pudo subir), roster y
      // entregas no tienen a qué colgarse — quedan pendientes para el
      // próximo intento, con el motivo ya listado arriba.
      const [current] = await db
        .select({ serverId: workdays.serverId })
        .from(workdays)
        .where(eq(workdays.id, workday.id));
      const workdayServerId = current?.serverId;
      if (!workdayServerId) {
        // Sin el _id real de la jornada, roster y anotaciones no tienen a
        // qué colgarse: el sync se detiene acá a propósito.
        log.done('detenido: la jornada todavía no está en el server');
        setRejectedReasons(reasons);
        await load();
        return;
      }

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
        const results = await harvesterWorkdayControllerSync({
          workdayId: workdayServerId,
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

        log.step('roster', summarizeBatch(results));
      } else {
        log.step('roster', 'nada pendiente');
      }

      if (syncableEntryRows.length > 0) {
        const chunks = Math.ceil(syncableEntryRows.length / ENTRY_SYNC_CHUNK);
        const entryResults: { status: string }[] = [];

        for (
          let start = 0;
          start < syncableEntryRows.length;
          start += ENTRY_SYNC_CHUNK
        ) {
          const chunk = syncableEntryRows.slice(
            start,
            start + ENTRY_SYNC_CHUNK,
          );
          const results = await harvestEntriesControllerSync({
            workdayId: workdayServerId,
            entries: chunk.map((row) => ({
              clientEntryId: row.id,
              harvesterId: row.harvesterId,
              measurementUnitId: row.measurementUnitId,
              unitCount: row.unitCount,
              // Los kilos de un envase pesado: el server los necesita porque
              // en modo WEIGHT no hay factor con qué calcularlos. Va siempre
              // la magnitud (el signo lo lleva unitCount) y va también en modo
              // COUNT, donde el server lo ignora y calcula desde el kgFactor
              // del catálogo — así esto no depende de mirar la unidad acá.
              // Redondeado además de la escritura, porque una fila vieja
              // (anotada antes de que existiera el redondeo) puede traer
              // 37.049999999999997 y el server rechaza más de un decimal.
              weightKg: roundToOneDecimal(Math.abs(row.totalKg)),
              // Peso de control (ver lib/weighing.ts). Va **el valor local tal
              // cual, null incluido**: este dispositivo es el único que escribe
              // ese campo, así que su null significa "no tiene peso", no "no
              // sé". Mandarlo como undefined —lo que hacía antes— volvía
              // imposible sacar un peso ya sincronizado: desaparecía de la
              // pantalla pero seguía vivo en la base.
              measuredKg: row.measuredKg,
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

          entryResults.push(...results);
          // Solo si va en más de un lote: con uno solo, la línea de la etapa
          // ya dice exactamente lo mismo.
          if (chunks > 1) {
            log.note(
              `lote ${start / ENTRY_SYNC_CHUNK + 1}/${chunks} · ${summarizeBatch(results)}`,
            );
          }
        }

        log.step('anotaciones', summarizeBatch(entryResults));
      } else {
        log.step('anotaciones', 'nada pendiente');
      }

      log.done(
        reasons.length > 0
          ? `${reasons.length} rechazo(s) — quedan pendientes para el próximo intento`
          : 'todo sincronizado',
      );

      setRejectedReasons(reasons);
      await load();
    } catch (err) {
      // Cierra la saga con el mismo id que el resto de sus líneas, así se ve
      // en qué etapa se cortó sin tener que cruzar dos consolas.
      log.fail(getErrorMessage(err));
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
              {pending.workday > 0 ? (
                <PendingRow
                  icon="calendar-outline"
                  label={
                    workday?.serverId
                      ? strings.sync.pendingWorkdayPay
                      : strings.sync.pendingWorkday
                  }
                  color={palette.primary}
                />
              ) : null}
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

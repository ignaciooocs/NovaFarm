import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
} from 'react-native-paper';
import {
  getHarvestEntriesControllerFindAllQueryKey,
  useHarvestEntriesControllerFindAll,
} from '@/api/generated/harvest-entries/harvest-entries';
import {
  getHarvesterWorkdayControllerFindAllQueryKey,
  useHarvesterWorkdayControllerFindAll,
} from '@/api/generated/harvester-workday/harvester-workday';
import {
  getWorkdaysControllerFindAllQueryKey,
  useWorkdaysControllerFindAll,
} from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import {
  markLocalWorkdayClosed,
  readLocalWorkday,
  setLocalWorkdaySyncSkipped,
  type LocalWorkdaySummary,
} from '@/db/queries';
import { getErrorMessage } from '@/lib/errors';
import { formatKg } from '@/lib/format';
import { readProductsById, useLocalRead } from '@/lib/localCatalogNames';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

// Sin filtro de status: se compara contra la jornada del server esté abierta
// o cerrada. No hay GET /workdays/:id, así que se pide la lista y se busca
// (mismo caso que history/[id].tsx).
const ALL_WORKDAYS = {};

// Detalle del historial local: qué tiene este celular de esta jornada y qué
// tiene el server, lado a lado, y qué se puede hacer con la diferencia
// (pedido del usuario, 2026-09-20).
//
// El lado local es SQLite y el del server son las mismas queries que usa el
// detalle del Historial. La comparación existe porque las dos mitades pueden
// separarse sin que nadie se entere: una respuesta que no llega deja la
// jornada cerrada allá y abierta acá, y unas entregas rechazadas quedan solo
// acá para siempre.
export default function LocalHistoryDetailScreen() {
  const { id: localWorkdayId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const productsById = useLocalRead(readProductsById);

  const [local, setLocal] = useState<LocalWorkdaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);

  const loadLocal = useCallback(async () => {
    try {
      setLocal(await readLocalWorkday(localWorkdayId));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [localWorkdayId]);

  useFocusEffect(
    useCallback(() => {
      loadLocal();
    }, [loadLocal]),
  );

  // Sin serverId no hay nada que preguntarle al server: la jornada nunca
  // subió. `enabled` evita tres peticiones que igual no dirían nada — y
  // pasarle opciones a un hook de orval exige darle su queryKey.
  const serverId = local?.serverId ?? '';
  const askServer = serverId.length > 0;
  const workdaysQuery = useWorkdaysControllerFindAll(ALL_WORKDAYS, {
    query: {
      queryKey: getWorkdaysControllerFindAllQueryKey(ALL_WORKDAYS),
      enabled: askServer,
    },
  });
  const entriesQuery = useHarvestEntriesControllerFindAll(
    { workdayId: serverId },
    {
      query: {
        queryKey: getHarvestEntriesControllerFindAllQueryKey({
          workdayId: serverId,
        }),
        enabled: askServer,
      },
    },
  );
  const rosterQuery = useHarvesterWorkdayControllerFindAll(
    { workdayId: serverId },
    {
      query: {
        queryKey: getHarvesterWorkdayControllerFindAllQueryKey({
          workdayId: serverId,
        }),
        enabled: askServer,
      },
    },
  );
  useRefreshOnFocus([
    workdaysQuery.queryKey,
    entriesQuery.queryKey,
    rosterQuery.queryKey,
  ]);

  const serverWorkday = workdaysQuery.data?.find(
    (workday) => workday._id === serverId,
  );
  const serverTotals = useMemo(() => {
    if (!entriesQuery.data || !rosterQuery.data) {
      return null;
    }
    return {
      totalKg: entriesQuery.data.reduce((sum, entry) => sum + entry.totalKg, 0),
      entryCount: entriesQuery.data.length,
      rosterCount: rosterQuery.data.length,
    };
  }, [entriesQuery.data, rosterQuery.data]);

  const queryError =
    workdaysQuery.error ?? entriesQuery.error ?? rosterQuery.error;
  const askingServer =
    askServer &&
    (workdaysQuery.isPending || entriesQuery.isPending || rosterQuery.isPending);

  async function handleSetSkipped(syncSkipped: boolean) {
    setSkipDialogOpen(false);
    setMarking(true);
    try {
      await setLocalWorkdaySyncSkipped(localWorkdayId, syncSkipped);
      await loadLocal();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMarking(false);
    }
  }

  async function handleMarkClosed() {
    if (!serverWorkday) {
      return;
    }
    setMarking(true);
    try {
      await markLocalWorkdayClosed(
        localWorkdayId,
        serverWorkday.finalTotalKg ?? null,
      );
      await loadLocal();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.localHistory.detailTitle }}
        />
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!local) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.localHistory.detailTitle }}
        />
        <HelperText type="error">{error ?? strings.errors.generic}</HelperText>
      </Screen>
    );
  }

  const product = productsById[local.productId];
  const pending =
    (local.synced ? 0 : 1) + local.pendingRoster + local.pendingEntries;
  // Subir sirve si la jornada nunca subió (el sync la crea), o si el server
  // la tiene abierta. Si el server no la tiene, o ya la cerró, no hay nada
  // que hacer desde acá. Mientras no se sabe (sin señal, o esperando) se
  // ofrece igual: el sync dirá lo suyo.
  const serverAnswered = askServer && !askingServer && !queryError;
  const canUpload = !serverAnswered
    ? true
    : Boolean(serverWorkday) && serverWorkday?.status === 'OPEN';
  // Qué pasa con esta jornada, en una frase, y qué se puede hacer. El orden
  // importa: lo que no subió nunca no se compara con nada.
  const diagnosis = local.syncSkipped
    ? strings.localHistory.skipped
    : !askServer
    ? strings.localHistory.neverUploaded
    : askingServer || queryError
      ? null
      : !serverWorkday
        ? strings.localHistory.notOnServer
        : pending > 0
          ? serverWorkday.status === 'CLOSED'
            ? strings.localHistory.pendingWhileClosed(pending)
            : strings.localHistory.pendingWhileOpen(pending)
          : serverWorkday.status === 'CLOSED' && local.status === 'OPEN'
            ? strings.localHistory.closedOnServerOnly
            : strings.localHistory.allMatches;

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.localHistory.detailTitle }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text variant="titleLarge" style={styles.title}>
          {product?.icon ?? DEFAULT_PRODUCT_ICON}{' '}
          {product?.name ?? strings.localHistory.unknownProduct}
        </Text>
        <Text style={styles.date}>
          {new Date(local.date).toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>

        {/* El error de red no tapa la mitad local: sin señal, lo de este
            celular igual se ve, que es el punto de esta pantalla. */}
        {queryError ? (
          <HelperText type="error">{getErrorMessage(queryError)}</HelperText>
        ) : null}
        {error ? <HelperText type="error">{error}</HelperText> : null}

        {diagnosis ? (
          <Text
            style={[styles.diagnosis, pending > 0 ? styles.diagnosisWarn : null]}
          >
            {diagnosis}
          </Text>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>
          {strings.localHistory.compareTitle}
        </Text>

        <View style={styles.compareHeader}>
          <View style={styles.compareRowLabel} />
          <Text style={styles.compareCell}>
            {strings.localHistory.onThisPhone}
          </Text>
          <Text style={styles.compareCell}>{strings.localHistory.onServer}</Text>
        </View>

        <CompareRow
          label={strings.localHistory.kilosLabel}
          local={`${formatKg(local.totalKg)} ${strings.anotador.kg}`}
          server={
            serverTotals
              ? `${formatKg(serverTotals.totalKg)} ${strings.anotador.kg}`
              : null
          }
          askingServer={askingServer}
          styles={styles}
        />
        <CompareRow
          label={strings.localHistory.roundsLabel}
          local={String(local.entryCount)}
          server={serverTotals ? String(serverTotals.entryCount) : null}
          askingServer={askingServer}
          styles={styles}
        />
        <CompareRow
          label={strings.localHistory.harvestersLabel}
          local={String(local.rosterCount)}
          server={serverTotals ? String(serverTotals.rosterCount) : null}
          askingServer={askingServer}
          styles={styles}
        />
        <CompareRow
          label={strings.localHistory.statusLabel}
          local={
            local.status === 'CLOSED'
              ? strings.localHistory.serverClosed
              : strings.localHistory.serverOpen
          }
          server={
            serverWorkday
              ? serverWorkday.status === 'CLOSED'
                ? strings.localHistory.serverClosed
                : strings.localHistory.serverOpen
              : null
          }
          askingServer={askingServer}
          styles={styles}
        />

        {/* Subir lo que falta es el mismo sync de siempre (sube todo lo
            pendiente del celular, no solo esta jornada): una sola
            implementación de la saga de 4 etapas, que es lo delicado.
            No se ofrece si subir no puede funcionar: si el server tiene la
            jornada cerrada, o si no la tiene y este celular cree que sí
            (encontrado probando: ofrecía subir una jornada que el server ya
            no tenía, y Sincronizar respondía que no hay jornada abierta). */}
        {!local.syncSkipped && pending > 0 && canUpload ? (
          <Button
            mode="contained"
            icon="cloud-upload-outline"
            onPress={() => router.push('/sync')}
            style={styles.action}
          >
            {strings.localHistory.uploadMissing}
          </Button>
        ) : null}

        {!local.syncSkipped &&
        pending === 0 &&
        local.status === 'OPEN' &&
        serverWorkday?.status === 'CLOSED' ? (
          <Button
            mode="contained"
            icon="flag-checkered"
            onPress={handleMarkClosed}
            loading={marking}
            disabled={marking}
            style={styles.action}
          >
            {strings.localHistory.markClosedHere}
          </Button>
        ) : null}

        {!local.syncSkipped &&
        pending === 0 &&
        local.status === 'OPEN' &&
        serverWorkday?.status === 'OPEN' ? (
          <Button
            mode="outlined"
            icon="flag-checkered"
            onPress={() =>
              router.push({
                pathname: '/workday/[id]/close',
                params: { id: local.id },
              })
            }
            textColor={palette.primary}
            style={styles.action}
          >
            {strings.localHistory.goToClose}
          </Button>
        ) : null}

        {/* La salida del callejón sin salida: cuando subir es imposible (el
            server no tiene la jornada, o ya la cerró), estas filas bloquean
            cerrar sesión para siempre. Darlas por perdidas no borra nada,
            solo deja de contarlas. */}
        {!local.syncSkipped && pending > 0 && serverAnswered && !canUpload ? (
          <Button
            mode="outlined"
            icon="cloud-off-outline"
            onPress={() => setSkipDialogOpen(true)}
            disabled={marking}
            textColor={palette.textSecondary}
            style={styles.action}
          >
            {strings.localHistory.skipAction}
          </Button>
        ) : null}

        {local.syncSkipped ? (
          <Button
            mode="outlined"
            icon="refresh"
            onPress={() => handleSetSkipped(false)}
            loading={marking}
            disabled={marking}
            textColor={palette.primary}
            style={styles.action}
          >
            {strings.localHistory.unskipAction}
          </Button>
        ) : null}
      </ScrollView>

      <Portal>
        {/* Dialog pelado y no KeyboardAwareDialog: no tiene campos, nunca
            sube el teclado. */}
        <Dialog
          visible={skipDialogOpen}
          onDismiss={() => setSkipDialogOpen(false)}
        >
          <Dialog.Title>{strings.localHistory.skipDialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{strings.localHistory.skipDialogBody}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSkipDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button onPress={() => handleSetSkipped(true)}>
              {strings.common.confirm}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function CompareRow({
  label,
  local,
  server,
  askingServer,
  styles,
}: {
  label: string;
  local: string;
  server: string | null;
  askingServer: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareRowLabel}>{label}</Text>
      <Text style={styles.compareCell}>{local}</Text>
      {/* "..." mientras responde el server, "—" si no hay nada que mostrar
          (nunca subió, no la tiene, o no hubo señal). */}
      <Text style={styles.compareCell}>
        {server ?? (askingServer ? '...' : '—')}
      </Text>
    </View>
  );
}

// Función en vez de StyleSheet.create() estático: usa el primary del tema
// activo (usePalette).
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    title: { fontWeight: '700' },
    date: {
      color: colors.textSecondary,
      textTransform: 'capitalize',
      marginBottom: spacing.md,
    },
    diagnosis: { color: colors.textPrimary, marginBottom: spacing.md },
    diagnosisWarn: { color: colors.warning, fontWeight: '600' },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.md,
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    compareHeader: { flexDirection: 'row', marginBottom: spacing.xs },
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    compareRowLabel: { flex: 1.2, color: colors.textSecondary },
    compareCell: { flex: 1, textAlign: 'right', color: colors.textPrimary },
    action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  });
}

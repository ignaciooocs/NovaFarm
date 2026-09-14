import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  HelperText,
  IconButton,
  Text,
} from 'react-native-paper';
import {
  useHarvestEntriesControllerFindAll,
  type HarvestEntriesControllerFindAllQueryResult,
} from '@/api/generated/harvest-entries/harvest-entries';
import {
  useHarvesterWorkdayControllerFindAll,
  type HarvesterWorkdayControllerFindAllQueryResult,
} from '@/api/generated/harvester-workday/harvester-workday';
import type { FindWorkdayResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { formatCLP, formatKg } from '@/lib/format';
import {
  readHarvesterNamesById,
  readProductsById,
  useLocalRead,
  type ProductInfo,
} from '@/lib/localCatalogNames';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { computePay, hasPay, sumPay, type WorkdayPay } from '@/lib/pay';
import { summarizeWeighing, type WeighingSummary } from '@/lib/weighing';
import { generateWorkdaySummaryPdf } from '@/lib/workdayPdf';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

interface RosterRow {
  harvesterId: string;
  workdayNumber: number;
  name: string;
  unitCount: number;
  totalKg: number;
}

interface WorkdayDetail extends WorkdayPay {
  productName: string;
  productIcon: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  recorderName?: string;
  totalKg: number;
  roster: RosterRow[];
  weighing: WeighingSummary | null;
}

// Sin filtro de status: esta pantalla también se usa para ver la jornada
// ABIERTA de alguien desde Mi equipo, no solo jornadas cerradas del
// Historial. (No hay GET /workdays/:id en el server, por eso se pide la
// lista y se busca.)
const ALL_WORKDAYS = {};

// Arma el detalle a partir de lo que ya trajeron las queries y la caché
// local de nombres. Pura: React Query decide cuándo hay datos nuevos, y esto
// solo se recalcula entonces.
function buildDetail(
  workday: FindWorkdayResponseDto,
  entryRows: HarvestEntriesControllerFindAllQueryResult,
  rosterRows: HarvesterWorkdayControllerFindAllQueryResult,
  productsById: Record<string, ProductInfo>,
  harvesterNamesById: Record<string, string>,
): WorkdayDetail {
  const totalsByHarvester: Record<
    string,
    { unitCount: number; totalKg: number }
  > = {};
  entryRows.forEach((entry) => {
    const current = totalsByHarvester[entry.harvesterId] ?? {
      unitCount: 0,
      totalKg: 0,
    };
    totalsByHarvester[entry.harvesterId] = {
      unitCount: current.unitCount + entry.unitCount,
      totalKg: current.totalKg + entry.totalKg,
    };
  });

  const roster = rosterRows
    .map((row) => ({
      harvesterId: row.harvesterId,
      workdayNumber: row.workdayNumber,
      name: harvesterNamesById[row.harvesterId] ?? '...',
      unitCount: totalsByHarvester[row.harvesterId]?.unitCount ?? 0,
      totalKg: totalsByHarvester[row.harvesterId]?.totalKg ?? 0,
    }))
    .sort((a, b) => a.workdayNumber - b.workdayNumber);

  const product = productsById[workday.productId];
  return {
    // La tarifa vive en la jornada del server, no en la caché local: esta
    // pantalla también muestra jornadas capturadas por otro dispositivo, que
    // nunca pasaron por este SQLite.
    payRate: workday.payRate ?? null,
    payBasis: workday.payBasis ?? null,
    productName: product?.name ?? workday.productId,
    productIcon: product?.icon ?? DEFAULT_PRODUCT_ICON,
    date: workday.date,
    status: workday.status,
    recorderName: workday.recorderName,
    totalKg:
      workday.finalTotalKg ??
      roster.reduce((sum, row) => sum + row.totalKg, 0),
    roster,
    // Sobre las entregas en vivo del server, no sobre el roster: el pesaje es
    // por vuelta, y el roster ya viene sumado.
    weighing: summarizeWeighing(entryRows),
  };
}

// Detalle de una jornada, cerrada (drill-down desde history.tsx) o
// **abierta** (drill-down desde team.tsx: "Jornada activa" en Mi equipo —
// ver ahí por qué). A diferencia del Anotador, acá no se puede confiar en la
// caché local (harvesterWorkday/harvestEntries en SQLite) porque la jornada
// puede haber sido capturada por otro dispositivo/recorder de la misma farm
// — así que el roster y las entregas se piden en vivo (GET
// /harvester-workday, GET /harvest-entries, ambos ya expuestos para el sync
// offline pero reusables acá de solo lectura). Para una jornada abierta esto
// significa que solo se ve lo que ese recorder ya sincronizó — nunca datos
// locales sin sincronizar de su dispositivo, que este dispositivo no tiene
// forma de ver. Solo los nombres de fruta/cosechador salen de la caché
// local, porque esos catálogos sí son de toda la farm.
export default function HistoryDetailScreen() {
  const { id: workdayServerId } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  // Medidos acá afuera, no con un SafeAreaView adentro del Modal: el Modal
  // presenta su contenido en una jerarquía nativa aparte, y los insets
  // calculados ahí no son confiables (bug real, encontrado en dispositivo —
  // los botones del visor de PDF quedaban tapados por la barra de estado).
  const insets = useSafeAreaInsets();

  const [exportingPdf, setExportingPdf] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const workdaysQuery = useWorkdaysControllerFindAll(ALL_WORKDAYS);
  const entriesQuery = useHarvestEntriesControllerFindAll({
    workdayId: workdayServerId,
  });
  const rosterQuery = useHarvesterWorkdayControllerFindAll({
    workdayId: workdayServerId,
  });
  useRefreshOnFocus([
    workdaysQuery.queryKey,
    entriesQuery.queryKey,
    rosterQuery.queryKey,
  ]);
  const productsById = useLocalRead(readProductsById);
  const harvesterNamesById = useLocalRead(readHarvesterNamesById);

  // find() devuelve el mismo objeto mientras la lista no cambie, así que el
  // useMemo de abajo no se recalcula en cada render.
  const workday = workdaysQuery.data?.find((w) => w._id === workdayServerId);
  const detail = useMemo(
    () =>
      workday && entriesQuery.data && rosterQuery.data
        ? buildDetail(
            workday,
            entriesQuery.data,
            rosterQuery.data,
            productsById,
            harvesterNamesById,
          )
        : null,
    [
      workday,
      entriesQuery.data,
      rosterQuery.data,
      productsById,
      harvesterNamesById,
    ],
  );
  const isPending =
    workdaysQuery.isPending || entriesQuery.isPending || rosterQuery.isPending;
  const queryError =
    workdaysQuery.error ?? entriesQuery.error ?? rosterQuery.error;

  async function handleExportPdf() {
    if (!detail) {
      return;
    }
    setExportingPdf(true);
    try {
      const uri = await generateWorkdaySummaryPdf(detail);
      // Distinto por plataforma a propósito: un WebView con un PDF local en
      // Android típicamente solo dispara una descarga silenciosa en vez de
      // mostrarlo (limitación conocida del WebView de Android, no de esta
      // librería) — así que ahí se usa directo el diálogo nativo de
      // impresión, que en Android sí lleva la vista previa por delante (a
      // diferencia de iOS, que abre en Opciones — ver handlePrint/el visor
      // de abajo, agregado justo por eso).
      if (Platform.OS === 'android') {
        await Print.printAsync({ uri });
      } else {
        setPreviewUri(uri);
      }
    } catch {
      // Sin conexión no debería pasar (todo el HTML se arma localmente); en
      // Android también puede rechazar si se cierra el diálogo sin
      // imprimir, que no es un error real que mostrarle.
    } finally {
      setExportingPdf(false);
    }
  }

  // Acción explícita aparte del visor (que ya muestra el contenido de
  // entrada) — comparte el archivo ya generado vía el share sheet nativo,
  // mismo mecanismo que ya usa invite-code.tsx para el código de invitación.
  async function handleShare() {
    if (!previewUri) {
      return;
    }
    setSharing(true);
    try {
      await Sharing.shareAsync(previewUri, { mimeType: 'application/pdf' });
    } catch {
      // Usuario canceló el share sheet — no es un error real.
    } finally {
      setSharing(false);
    }
  }

  // Spinner solo si todavía no hay nada que mostrar: al volver a una jornada
  // ya vista, el detalle en caché se ve al tiro mientras se refresca.
  if (isPending && !detail) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <HelperText type="error">
          {/* Sin error de red y sin detalle: la lista llegó pero esa jornada
              no está en ella. */}
          {queryError ? getErrorMessage(queryError) : strings.errors.generic}
        </HelperText>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${detail.productIcon} ${detail.productName}`,
          headerRight: () =>
            exportingPdf ? (
              <ActivityIndicator size="small" style={styles.headerAction} />
            ) : (
              <IconButton
                icon="file-pdf-box"
                onPress={handleExportPdf}
                style={styles.headerAction}
              />
            ),
        }}
      />

      {/* Hay detalle en caché pero el último refresco falló (sin señal): se
          avisa arriba en vez de tapar lo que ya se tenía. */}
      {queryError ? (
        <HelperText type="error">{getErrorMessage(queryError)}</HelperText>
      ) : null}

      <FlatList
        data={detail.roster}
        keyExtractor={(item) => item.harvesterId}
        ListHeaderComponent={
          <View style={styles.summary}>
            <View style={styles.headerBlock}>
              <Text style={styles.eyebrow}>
                {new Date(detail.date).toLocaleDateString('es-CL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              {detail.recorderName ? (
                <Text style={styles.recorderText}>
                  {strings.history.recordedBy(detail.recorderName)}
                </Text>
              ) : null}
              {detail.status === 'OPEN' ? (
                <Text style={[styles.openBadge, { color: palette.primary }]}>
                  {strings.history.openLabel}
                </Text>
              ) : null}
            </View>

            <Text style={styles.totalLabel}>
              {detail.status === 'OPEN'
                ? strings.history.syncedSoFar
                : strings.workday.totalKg}
            </Text>
            <Text style={styles.totalValue}>
              {formatKg(detail.totalKg)}
              <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
            </Text>

            {hasPay(detail) ? (
              <>
                <Text style={styles.totalLabel}>
                  {strings.pay.totalToPay}
                </Text>
                <Text style={[styles.payValue, { color: palette.primary }]}>
                  {formatCLP(sumPay(detail, detail.roster) ?? 0)}
                </Text>
              </>
            ) : null}

            <Text style={styles.metaText}>
              {strings.history.workersCount(detail.roster.length)}
            </Text>

            {detail.weighing ? (
              <View style={styles.weighingBlock}>
                <Text style={styles.sectionLabel}>
                  {strings.weighing.controlTitle}
                </Text>
                <Text style={styles.weighingSummary}>
                  {strings.weighing.roundsSummary(
                    detail.weighing.weighedRounds,
                    detail.weighing.totalRounds,
                  )}
                </Text>
                <Text style={styles.weighingSummary}>
                  {strings.weighing.comparison(
                    formatKg(detail.weighing.measuredKg),
                    formatKg(detail.weighing.expectedKg),
                  )}{' '}
                  (
                  {strings.weighing.difference(
                    formatKg(detail.weighing.differenceKg),
                    detail.weighing.differenceKg > 0,
                  )}
                  )
                </Text>
                <Text style={styles.weighingNote}>
                  {strings.weighing.doesNotAffect}
                </Text>
              </View>
            ) : null}

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>{strings.history.team}</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyRoster}>{strings.admin.emptyList}</Text>
        }
        renderItem={({ item }) => {
          const pay = detail ? computePay(detail, item) : null;
          return (
            <View style={styles.rosterRow}>
              <Text style={styles.rosterNumber}>{item.workdayNumber}</Text>
              <Text style={styles.rosterName}>{item.name}</Text>
              <View style={styles.rosterRight}>
                <Text style={styles.rosterTotal}>
                  {strings.anotador.containers(item.unitCount)} ·{' '}
                  {formatKg(item.totalKg)} {strings.anotador.kg}
                </Text>
                {pay != null ? (
                  <Text style={[styles.rosterPay, { color: palette.primary }]}>
                    {formatCLP(pay)}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={previewUri !== null}
        animationType="slide"
        onRequestClose={() => setPreviewUri(null)}
      >
        <View style={[styles.previewContainer, { paddingBottom: insets.bottom }]}>
          <View style={[styles.previewHeader, { paddingTop: insets.top }]}>
            <IconButton icon="close" onPress={() => setPreviewUri(null)} />
            {sharing ? (
              <ActivityIndicator size="small" style={styles.headerAction} />
            ) : (
              <IconButton icon="share-variant" onPress={handleShare} />
            )}
          </View>
          {previewUri ? (
            // originWhitelist: sin esto, WebView solo navega a orígenes
            // http(s):// por defecto — un file:// nunca calza ahí, así que
            // rechazaba cargar el PDF y se lo pasaba al sistema operativo
            // (el warning "Can't open url: file://..." que reportó el
            // usuario). '*' habilita también el esquema file://.
            <WebView
              source={{ uri: previewUri }}
              style={styles.previewWeb}
              originWhitelist={['*']}
            />
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: rosterNumber usa el
// primary del tema activo (usePalette), así que los estilos deben
// recalcularse cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    headerAction: { marginRight: spacing.xs },
    summary: { marginBottom: spacing.sm },
    headerBlock: { marginBottom: spacing.lg },
    eyebrow: { color: colors.textSecondary, textTransform: 'capitalize' },
    recorderText: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    openBadge: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    totalLabel: { color: colors.textSecondary, fontSize: 13 },
    totalValue: {
      color: colors.textPrimary,
      fontWeight: '800',
      fontSize: 40,
      lineHeight: 46,
      marginBottom: spacing.sm,
    },
    totalUnit: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    payValue: {
      fontWeight: '800',
      fontSize: 28,
      lineHeight: 34,
      marginBottom: spacing.sm,
    },
    metaText: { color: colors.textSecondary, marginBottom: spacing.lg },
    weighingBlock: { marginBottom: spacing.lg },
    weighingSummary: { fontSize: 13, color: colors.textPrimary },
    weighingNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
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
    rosterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rosterNumber: {
      width: spacing.lg,
      textAlign: 'center',
      color: colors.primary,
      fontWeight: '700',
    },
    rosterName: { flex: 1, marginLeft: spacing.sm },
    rosterRight: { alignItems: 'flex-end' },
    rosterTotal: { color: colors.textSecondary },
    rosterPay: { fontWeight: '700', marginTop: 2 },
    emptyRoster: { paddingVertical: spacing.md, color: colors.textSecondary },
    previewContainer: { flex: 1, backgroundColor: colors.surface },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    previewWeb: { flex: 1 },
  });
}

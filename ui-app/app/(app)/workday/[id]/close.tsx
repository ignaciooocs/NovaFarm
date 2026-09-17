import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { and, eq } from 'drizzle-orm';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import {
  getWorkdaysControllerFindAllQueryKey,
  useWorkdaysControllerClose,
} from '@/api/generated/workdays/workdays';
import { KeyboardAwareDialog } from '@/components/KeyboardAwareDialog';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import {
  products,
  harvesters as harvestersTable,
  harvestEntries,
  harvesterWorkday,
  measurementUnits,
  workdays,
} from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { formatCLP, formatKg, sanitizeIntegerInput } from '@/lib/format';
import {
  computePay,
  convertRate,
  hasPay,
  sumPay,
  type PayBasis,
} from '@/lib/pay';
import { summarizeWeighing, type WeighingSummary } from '@/lib/weighing';
import { pushPendingWorkdays } from '@/lib/workdaySync';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

type WorkdayRow = typeof workdays.$inferSelect;

interface RosterTotal {
  harvesterId: string;
  workdayNumber: number;
  name: string;
  unitCount: number;
  totalKg: number;
}

// Cerrar es una acción online, igual que abrir: el total definitivo lo
// congela el server sumando lo que ya tiene sincronizado. Por eso, si queda
// algo pendiente de subir, esta pantalla no deja cerrar — lo manda primero
// a Sincronizar, para que el total congelado no quede incompleto.
//
// También es donde se ve el pago del día y donde se define o corrige la
// tarifa si no se puso al abrir (el precio muchas veces todavía no está
// cerrado a esa hora). Se edita solo mientras la jornada siga abierta: una
// vez cerrada, cambiar la tarifa reescribiría cuánto se le dijo a cada
// cosechador que había ganado.
export default function CloseWorkdayScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [workday, setWorkday] = useState<WorkdayRow | null>(null);
  const [productName, setProductName] = useState('');
  const [productIcon, setProductIcon] = useState(DEFAULT_PRODUCT_ICON);
  const [unit, setUnit] = useState<{
    name: string;
    mode: 'COUNT' | 'WEIGHT';
    kgFactor: number | null;
  } | null>(null);
  const [roster, setRoster] = useState<RosterTotal[]>([]);
  const [weighing, setWeighing] = useState<WeighingSummary | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [localTotalKg, setLocalTotalKg] = useState(0);
  const [loading, setLoading] = useState(true);
  // Solo el error de la tarifa: el del cierre es closeWorkday.error.
  const [error, setError] = useState<string | null>(null);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payBasisInput, setPayBasisInput] = useState<PayBasis>('PER_UNIT');
  const [savingPay, setSavingPay] = useState(false);

  // Sin setLoading(true) acá, a propósito (mismo arreglo que el Anotador):
  // `loading` nace en true y solo cubre la primera carga. Esta función corre
  // también al volver a la pantalla y después de guardar la tarifa, y
  // prender el spinner reemplazaría la pantalla entera por un instante.
  const load = useCallback(async () => {
    try {
      const [row] = await db
        .select()
        .from(workdays)
        .where(eq(workdays.id, workdayId));
      setWorkday(row ?? null);
      if (!row) {
        return;
      }

      const [
        productRow,
        unitRow,
        pendingRoster,
        pendingEntries,
        allEntries,
        rosterRows,
        harvesterRows,
      ] = await Promise.all([
        db.select().from(products).where(eq(products.id, row.productId)),
        db
          .select()
          .from(measurementUnits)
          .where(eq(measurementUnits.id, row.defaultMeasurementUnitId)),
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
        db
          .select()
          .from(harvesterWorkday)
          .where(eq(harvesterWorkday.workdayId, workdayId)),
        db.select().from(harvestersTable),
      ]);

      setProductName(productRow[0]?.name ?? '');
      setProductIcon(productRow[0]?.icon ?? DEFAULT_PRODUCT_ICON);
      setUnit(
        unitRow[0]
          ? {
              name: unitRow[0].name,
              mode: unitRow[0].mode,
              kgFactor: unitRow[0].kgFactor,
            }
          : null,
      );
      // La jornada misma cuenta como pendiente si se abrió sin conexión y
      // todavía no subió: sin esto, handleClose() se topa con su propio
      // `return` por falta de serverId y el botón no hace nada sin
      // explicar por qué.
      setPendingCount(
        (row.synced ? 0 : 1) + pendingRoster.length + pendingEntries.length,
      );
      setLocalTotalKg(allEntries.reduce((sum, entry) => sum + entry.totalKg, 0));
      setWeighing(summarizeWeighing(allEntries));

      // Un solo recorrido de las entregas arma el total por cosechador,
      // igual que en el Anotador y en Inicio — no una consulta por persona.
      const totalsByHarvester: Record<
        string,
        { unitCount: number; totalKg: number }
      > = {};
      allEntries.forEach((entry) => {
        const current = totalsByHarvester[entry.harvesterId] ?? {
          unitCount: 0,
          totalKg: 0,
        };
        totalsByHarvester[entry.harvesterId] = {
          unitCount: current.unitCount + entry.unitCount,
          totalKg: current.totalKg + entry.totalKg,
        };
      });
      const namesById: Record<string, string> = {};
      harvesterRows.forEach((harvester) => {
        namesById[harvester.id] =
          `${harvester.firstName} ${harvester.lastName}`;
      });
      setRoster(
        rosterRows
          .map((rosterRow) => ({
            harvesterId: rosterRow.harvesterId,
            workdayNumber: rosterRow.workdayNumber,
            name: namesById[rosterRow.harvesterId] ?? '...',
            unitCount: totalsByHarvester[rosterRow.harvesterId]?.unitCount ?? 0,
            totalKg: totalsByHarvester[rosterRow.harvesterId]?.totalKg ?? 0,
          }))
          .sort((a, b) => a.workdayNumber - b.workdayNumber),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [workdayId]);

  // Al foco y no solo al montar: "Sincronizar" se abre encima de esta
  // pantalla, que sigue montada abajo. Con useEffect, al volver con todo ya
  // sincronizado seguía contando lo pendiente de antes y mostrando
  // "Sincronizar" en vez de "Cerrar jornada", hasta salir y volver a entrar.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Todo lo que sigue al cierre va en el onSuccess del hook y no en el de
  // mutate(): el del hook corre aunque la pantalla ya no esté (si se volvió
  // atrás mientras cerraba), y la jornada no puede quedar cerrada en el
  // server y abierta en SQLite. Además, isPending sigue prendido hasta que
  // termina, y si la escritura local falla la mutación queda en error —
  // reintentar es seguro, el cierre del server es idempotente.
  const closeWorkday = useWorkdaysControllerClose({
    mutation: {
      onSuccess: async (result) => {
        await db
          .update(workdays)
          .set({
            status: 'CLOSED',
            finalTotalKg: result.finalTotalKg ?? null,
          })
          .where(eq(workdays.id, workdayId));

        // Sin parámetros la key es el prefijo de todas las listas de
        // jornadas (cerradas del Historial, abiertas de Inicio/Mi equipo,
        // todas del detalle): la recién cerrada cambia de una a otra, y así
        // ninguna pantalla la muestra en el lugar viejo mientras se refresca.
        queryClient.invalidateQueries({
          queryKey: getWorkdaysControllerFindAllQueryKey(),
        });

        router.replace('/home');
      },
    },
  });

  function handleClose() {
    if (!workday?.serverId) {
      return;
    }
    setError(null);
    closeWorkday.mutate({ id: workday.serverId });
  }

  function openPayDialog() {
    setPayAmountInput(workday?.payRate != null ? String(workday.payRate) : '');
    setPayBasisInput(
      workday?.payBasis ?? (unit?.mode === 'WEIGHT' ? 'PER_KG' : 'PER_UNIT'),
    );
    setPayDialogOpen(true);
  }

  // Guarda la tarifa local y la sube al tiro. Lo segundo importa: el PDF y
  // el detalle del Historial se arman con la jornada del server, así que una
  // tarifa que solo existe en este celular no aparecería en el papel que se
  // le pasa al patrón. Si no hay señal queda pendiente como cualquier otra
  // cosa (y esta misma pantalla ya bloquea cerrar hasta sincronizar).
  async function savePay(payRate: number | null) {
    setSavingPay(true);
    setError(null);
    // Un solo aviso a la vez, el del último intento (como antes). Nunca
    // resetear un cierre en curso: se desengancharía su onSuccess.
    if (closeWorkday.isError) {
      closeWorkday.reset();
    }
    try {
      const payBasis =
        payRate == null
          ? null
          : unit?.mode === 'WEIGHT'
            ? 'PER_KG'
            : payBasisInput;

      await db
        .update(workdays)
        .set({ payRate, payBasis, synced: false })
        .where(eq(workdays.id, workdayId));

      setPayDialogOpen(false);

      const { rejectedReasons } = await pushPendingWorkdays();
      if (rejectedReasons.length > 0) {
        setError(rejectedReasons[0]);
      }

      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingPay(false);
    }
  }

  const pay = {
    payRate: workday?.payRate ?? null,
    payBasis: workday?.payBasis ?? null,
  };
  const payDefined = hasPay(pay);
  const totalPay = sumPay(pay, roster);
  const dialogRate = payAmountInput ? Number(payAmountInput) : null;
  const errorMessage = closeWorkday.error
    ? getErrorMessage(closeWorkday.error)
    : error;

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
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text variant="titleLarge" style={styles.productName}>
              {productIcon} {productName}
            </Text>
            <Text style={styles.dateText}>
              {new Date(workday.date).toLocaleDateString('es-CL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>

            <View
              style={[
                styles.totalCard,
                { backgroundColor: palette.primarySoft },
              ]}
            >
              <Text style={styles.totalLabel}>{strings.workday.totalKg}</Text>
              <Text style={[styles.totalValue, { color: palette.primary }]}>
                {formatKg(localTotalKg)}
                <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
              </Text>
            </View>

            {weighing ? (
              <View style={styles.weighingBlock}>
                <Text style={styles.sectionLabel}>
                  {strings.weighing.controlTitle}
                </Text>
                <Text style={styles.weighingSummary}>
                  {strings.weighing.roundsSummary(
                    weighing.weighedRounds,
                    weighing.totalRounds,
                  )}
                </Text>
                <Text style={styles.weighingSummary}>
                  {strings.weighing.comparison(
                    formatKg(weighing.measuredKg),
                    formatKg(weighing.expectedKg),
                  )}{' '}
                  (
                  {strings.weighing.difference(
                    formatKg(weighing.differenceKg),
                    weighing.differenceKg > 0,
                  )}
                  )
                </Text>
                <Text style={styles.weighingNote}>
                  {strings.weighing.doesNotAffect}
                </Text>
              </View>
            ) : null}

            {payDefined ? (
              <>
                <Text style={styles.payLabel}>{strings.pay.totalToPay}</Text>
                <Text style={[styles.payValue, { color: palette.primary }]}>
                  {formatCLP(totalPay ?? 0)}
                </Text>
                <Text style={styles.payNote}>{strings.pay.estimatedNote}</Text>
                <Button
                  mode="text"
                  icon="pencil"
                  onPress={openPayDialog}
                  textColor={palette.primary}
                  style={styles.payAction}
                >
                  {strings.pay.edit}
                </Button>

                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>{strings.pay.perPerson}</Text>
                {roster.map((row) => (
                  <View key={row.harvesterId} style={styles.rosterRow}>
                    <Text
                      style={[styles.rosterNumber, { color: palette.primary }]}
                    >
                      {row.workdayNumber}
                    </Text>
                    <Text style={styles.rosterName}>{row.name}</Text>
                    <View style={styles.rosterRight}>
                      <Text style={styles.rosterTotal}>
                        {strings.anotador.containers(row.unitCount)} ·{' '}
                        {formatKg(row.totalKg)} {strings.anotador.kg}
                      </Text>
                      <Text style={styles.rosterPay}>
                        {formatCLP(computePay(pay, row) ?? 0)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <Button
                mode="text"
                icon="cash"
                onPress={openPayDialog}
                textColor={palette.primary}
                style={styles.payAction}
              >
                {strings.pay.define}
              </Button>
            )}
          </ScrollView>

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
              {errorMessage ? (
                <HelperText type="error">{errorMessage}</HelperText>
              ) : null}
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
              {errorMessage ? (
                <HelperText type="error">{errorMessage}</HelperText>
              ) : null}
              <Button
                mode="contained"
                onPress={handleClose}
                loading={closeWorkday.isPending}
                disabled={closeWorkday.isPending}
                style={styles.button}
              >
                {strings.workday.close}
              </Button>
            </View>
          )}
        </>
      )}

      <Portal>
        {/* KeyboardAwareDialog y no Dialog pelado: tiene un campo de texto
            adentro, así que en iOS el teclado lo taparía (ver el componente). */}
        <KeyboardAwareDialog
          theme={{ version: 3 }}
          visible={payDialogOpen}
          onDismiss={() => setPayDialogOpen(false)}
        >
          <Dialog.Title>{strings.pay.dialogTitle}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView
              contentContainerStyle={styles.dialogForm}
              keyboardShouldPersistTaps="handled"
            >
              {unit?.mode === 'COUNT' ? (
                <>
                  <Text style={styles.payNote}>{strings.pay.basisLabel}</Text>
                  <OptionSelector<PayBasis>
                    value={payBasisInput}
                    onChange={setPayBasisInput}
                    style={styles.dialogSelector}
                    options={[
                      {
                        value: 'PER_UNIT',
                        short: strings.pay.perUnitShort(unit.name),
                        description: strings.pay.perUnitHelp(unit.name),
                      },
                      {
                        value: 'PER_KG',
                        short: strings.pay.perKgShort,
                        description: strings.pay.perKgHelp(
                          strings.admin.unitEquivalence(
                            unit.name,
                            unit.kgFactor ?? 0,
                          ),
                        ),
                      },
                    ]}
                  />
                </>
              ) : (
                <Text style={styles.payNote}>
                  {strings.pay.weighedFixedNote}
                </Text>
              )}

              <TextInput
                mode="outlined"
                label={strings.pay.amountLabel}
                value={payAmountInput}
                onChangeText={(text) =>
                  setPayAmountInput(sanitizeIntegerInput(text))
                }
                keyboardType="number-pad"
                left={<TextInput.Affix text="$" />}
                outlineColor={colors.border}
                activeOutlineColor={palette.primary}
              />
              <HelperText type="info" visible>
                {dialogRate == null || !unit
                  ? strings.pay.optionalHelp
                  : buildRateLabel(dialogRate, payBasisInput, unit)}
              </HelperText>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {payDefined ? (
              <Button
                onPress={() => savePay(null)}
                disabled={savingPay}
                textColor={colors.textSecondary}
              >
                {strings.pay.remove}
              </Button>
            ) : null}
            <Button
              onPress={() => setPayDialogOpen(false)}
              disabled={savingPay}
            >
              {strings.common.cancel}
            </Button>
            <Button
              onPress={() => savePay(dialogRate)}
              loading={savingPay}
              disabled={savingPay}
            >
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </KeyboardAwareDialog>
      </Portal>
    </Screen>
  );
}

// Misma conversión que en Abrir Jornada: las dos caras del mismo precio,
// para que las dos opciones no se lean como dos tratos distintos.
function buildRateLabel(
  rate: number,
  basis: PayBasis,
  unit: { name: string; mode: 'COUNT' | 'WEIGHT'; kgFactor: number | null },
): string {
  if (unit.mode !== 'COUNT' || unit.kgFactor == null) {
    return strings.pay.ratePerKg(formatCLP(rate));
  }

  const { converted, exact } = convertRate(rate, unit.kgFactor, basis);

  return basis === 'PER_UNIT'
    ? strings.pay.ratePerUnitWithKg(
        formatCLP(rate),
        formatCLP(converted),
        unit.name,
        exact,
      )
    : strings.pay.ratePerKgWithUnit(
        formatCLP(rate),
        formatCLP(converted),
        unit.name,
        exact,
      );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  scroll: { flex: 1 },
  productName: { fontWeight: '700' },
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
  weighingBlock: { marginBottom: spacing.lg },
  weighingSummary: { fontSize: 13 },
  weighingNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  payLabel: { color: colors.textSecondary, fontSize: 13 },
  payValue: { fontWeight: '800', fontSize: 28, lineHeight: 34 },
  payNote: { color: colors.textSecondary, fontSize: 13 },
  payAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginVertical: spacing.md,
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
  rosterNumber: { width: spacing.lg, textAlign: 'center', fontWeight: '700' },
  rosterName: { flex: 1, marginLeft: spacing.sm },
  rosterRight: { alignItems: 'flex-end' },
  rosterTotal: { color: colors.textSecondary, fontSize: 13 },
  rosterPay: { fontWeight: '700', marginTop: 2 },
  blockedState: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  blockedText: { color: colors.textSecondary, textAlign: 'center' },
  confirmState: { gap: spacing.sm, paddingTop: spacing.md },
  confirmText: { color: colors.textSecondary },
  button: { marginTop: spacing.md, alignSelf: 'stretch' },
  dialogForm: { paddingVertical: spacing.sm },
  dialogSelector: { marginBottom: spacing.md },
});

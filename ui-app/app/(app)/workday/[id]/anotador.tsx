import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { eq } from 'drizzle-orm';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import {
  harvesters as harvestersTable,
  harvestEntries,
  harvesterWorkday,
  measurementUnits,
  workdays,
} from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { generateLocalId } from '@/lib/id';
import { usePalette } from '@/stores';
import { spacing, TOUCH_TARGET_MIN } from '@/theme';

type LocalHarvester = typeof harvestersTable.$inferSelect;

interface RosterRow {
  id: string;
  harvesterId: string;
  workdayNumber: number;
}

interface EntryTotal {
  unitCount: number;
  totalKg: number;
}

interface RoundEntry {
  id: string;
  unitCount: number;
  totalKg: number;
  recordedAt: string;
}

// Roster + registro real (RF-02): tocar +1/+2/+5/-1 escribe local al tiro
// (RNF-01, sin esperar la base ni la red — el estado se actualiza primero,
// la escritura a SQLite corre atrás). Si la unidad por defecto de la
// jornada tiene kgFactor = 1 (modo pesaje directo, RF-03.2), en vez de los
// botones se pide el peso exacto por diálogo. El botón (!) por cosechador
// abre el detalle de cada vuelta anotada (entriesByHarvester ya trae todo
// lo necesario desde load(), sin pedir de nuevo a la base al tocarlo).
export default function AnotadorScreen() {
  const router = useRouter();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [harvestersById, setHarvestersById] = useState<
    Record<string, LocalHarvester>
  >({});
  const [totalsByHarvester, setTotalsByHarvester] = useState<
    Record<string, EntryTotal>
  >({});
  const [entriesByHarvester, setEntriesByHarvester] = useState<
    Record<string, RoundEntry[]>
  >({});
  const [defaultUnit, setDefaultUnit] = useState<{
    id: string;
    name: string;
    kgFactor: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weightDialogHarvesterId, setWeightDialogHarvesterId] = useState<
    string | null
  >(null);
  const [weightInput, setWeightInput] = useState('');
  // Sumar/descontar en modo pesaje directo (pedido del usuario, 2026-09-03):
  // en modo contenedores el -1 ya cubre la corrección; acá no había forma
  // de descontar kg específicos si un supervisor lo pedía. El teclado
  // numérico (decimal-pad) normalmente no tiene tecla de signo menos, así
  // que el toggle decide el signo — lo que se tipea siempre es una
  // magnitud positiva.
  const [weightMode, setWeightMode] = useState<'add' | 'discount'>('add');
  const [infoHarvesterId, setInfoHarvesterId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workdayRow] = await db
        .select()
        .from(workdays)
        .where(eq(workdays.id, workdayId));
      if (!workdayRow) {
        setError(strings.errors.generic);
        return;
      }

      const [units, harvestersResult, rosterRows, entryRows] =
        await Promise.all([
          db.select().from(measurementUnits),
          db.select().from(harvestersTable),
          db
            .select()
            .from(harvesterWorkday)
            .where(eq(harvesterWorkday.workdayId, workdayId)),
          db
            .select()
            .from(harvestEntries)
            .where(eq(harvestEntries.workdayId, workdayId)),
        ]);

      // Orden cronológico explícito en JS (no confiar en el orden de
      // llegada de la consulta) — recordedAt es ISO 8601, así que comparar
      // como string ya da el orden temporal correcto.
      entryRows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

      const unit = units.find(
        (candidate) => candidate.id === workdayRow.defaultMeasurementUnitId,
      );
      setDefaultUnit(
        unit ? { id: unit.id, name: unit.name, kgFactor: unit.kgFactor } : null,
      );

      const byId: Record<string, LocalHarvester> = {};
      harvestersResult.forEach((harvester) => {
        byId[harvester.id] = harvester;
      });
      setHarvestersById(byId);

      // Un solo recorrido de las entregas arma tanto los totales (antes se
      // pedían aparte con un sum()+groupBy en SQL) como el detalle por
      // vuelta que necesita el diálogo de información — así (!) abre al
      // tiro, sin otra consulta a la base en ese momento.
      const totals: Record<string, EntryTotal> = {};
      const entries: Record<string, RoundEntry[]> = {};
      entryRows.forEach((row) => {
        const current = totals[row.harvesterId] ?? {
          unitCount: 0,
          totalKg: 0,
        };
        totals[row.harvesterId] = {
          unitCount: current.unitCount + row.unitCount,
          totalKg: current.totalKg + row.totalKg,
        };
        const list = entries[row.harvesterId] ?? [];
        list.push({
          id: row.id,
          unitCount: row.unitCount,
          totalKg: row.totalKg,
          recordedAt: row.recordedAt,
        });
        entries[row.harvesterId] = list;
      });
      setTotalsByHarvester(totals);
      setEntriesByHarvester(entries);

      setRoster(
        rosterRows
          .map((row) => ({
            id: row.id,
            harvesterId: row.harvesterId,
            workdayNumber: row.workdayNumber,
          }))
          .sort((a, b) => a.workdayNumber - b.workdayNumber),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [workdayId]);

  // useFocusEffect: al volver de add-harvester esta pantalla sigue montada
  // en el stack, hay que refrescar al recuperar foco, no solo al montar.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function recordDelivery(harvesterId: string, unitCount: number) {
    if (!defaultUnit) {
      return;
    }
    const totalKgDelta = unitCount * defaultUnit.kgFactor;
    const entryId = generateLocalId();
    const recordedAt = new Date().toISOString();

    // Actualiza la UI al tiro (RNF-01) — la escritura a SQLite sigue en
    // paralelo, sin bloquear el próximo toque. Actualiza tanto el total
    // como la lista de vueltas, para que el diálogo (!) quede al día sin
    // tener que recargar.
    setTotalsByHarvester((prev) => {
      const current = prev[harvesterId] ?? { unitCount: 0, totalKg: 0 };
      return {
        ...prev,
        [harvesterId]: {
          unitCount: current.unitCount + unitCount,
          totalKg: current.totalKg + totalKgDelta,
        },
      };
    });
    setEntriesByHarvester((prev) => {
      const current = prev[harvesterId] ?? [];
      return {
        ...prev,
        [harvesterId]: [
          ...current,
          { id: entryId, unitCount, totalKg: totalKgDelta, recordedAt },
        ],
      };
    });

    db.insert(harvestEntries)
      .values({
        id: entryId,
        workdayId,
        harvesterId,
        measurementUnitId: defaultUnit.id,
        unitCount,
        totalKg: totalKgDelta,
        recordedAt,
        synced: false,
      })
      .catch((err) => {
        // Rara vez falla una escritura local, pero si pasa hay que revertir
        // el total optimista y la vuelta que se agregó — no dejar la UI
        // mostrando algo que no quedó guardado.
        setTotalsByHarvester((prev) => {
          const current = prev[harvesterId] ?? { unitCount: 0, totalKg: 0 };
          return {
            ...prev,
            [harvesterId]: {
              unitCount: current.unitCount - unitCount,
              totalKg: current.totalKg - totalKgDelta,
            },
          };
        });
        setEntriesByHarvester((prev) => {
          const current = prev[harvesterId] ?? [];
          return {
            ...prev,
            [harvesterId]: current.filter((entry) => entry.id !== entryId),
          };
        });
        setError(getErrorMessage(err));
      });
  }

  function openWeightDialog(harvesterId: string) {
    setWeightInput('');
    setWeightMode('add');
    setWeightDialogHarvesterId(harvesterId);
  }

  function submitWeight() {
    const magnitude = Number(weightInput.replace(',', '.'));
    if (!weightDialogHarvesterId || !magnitude || magnitude <= 0) {
      return;
    }
    // Server ya acepta unitCount negativo (RF-02.3, mismo mecanismo que el
    // -1 de modo contenedores) — acá solo se decide el signo según el
    // toggle, la magnitud tipeada siempre es positiva.
    const value = weightMode === 'discount' ? -magnitude : magnitude;
    recordDelivery(weightDialogHarvesterId, value);
    setWeightDialogHarvesterId(null);
  }

  const grandTotalKg = Object.values(totalsByHarvester).reduce(
    (sum, entry) => sum + entry.totalKg,
    0,
  );
  const isDirectWeighing = defaultUnit?.kgFactor === 1;
  const infoHarvester = infoHarvesterId
    ? harvestersById[infoHarvesterId]
    : null;
  // El número de vuelta se calcula ANTES de dar vuelta el orden — así el
  // número (posición cronológica real) nunca depende de cómo se termina
  // mostrando. entriesByHarvester ya viene en orden ascendente (ver load()),
  // así que index+1 = número de vuelta real; el .reverse() de después es
  // puramente de presentación, para que la más reciente quede arriba.
  const infoRounds = infoHarvesterId
    ? (entriesByHarvester[infoHarvesterId] ?? [])
        .map((round, index) => ({ ...round, roundNumber: index + 1 }))
        .reverse()
    : [];

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, title: strings.anotador.title }} />

      <Text variant="headlineSmall" style={styles.grandTotal}>
        {strings.anotador.grandTotal}: {grandTotalKg.toFixed(2)} {strings.anotador.kg}
      </Text>

      <View style={styles.linkRow}>
        <Button mode="text" onPress={() => router.push('/sync')}>
          {strings.sync.title}
        </Button>
        <Button
          mode="text"
          onPress={() =>
            router.push({
              pathname: '/workday/[id]/close',
              params: { id: workdayId },
            })
          }
        >
          {strings.workday.closeTitle}
        </Button>
      </View>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <FlatList
        data={roster}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const harvester = harvestersById[item.harvesterId];
          const totals = totalsByHarvester[item.harvesterId] ?? {
            unitCount: 0,
            totalKg: 0,
          };
          const name = harvester
            ? `${harvester.firstName} ${harvester.lastName}`
            : '...';

          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowNumber}>{item.workdayNumber}</Text>
                <View style={styles.rowHeaderText}>
                  <Text variant="titleMedium">{name}</Text>
                  <Text variant="bodyMedium" style={styles.rowSubtitle}>
                    {totals.unitCount} {strings.anotador.units} ·{' '}
                    {totals.totalKg.toFixed(2)} {strings.anotador.kg}
                  </Text>
                </View>
                <IconButton
                  icon="information-outline"
                  size={20}
                  accessibilityLabel={strings.anotador.roundsTitle}
                  onPress={() => setInfoHarvesterId(item.harvesterId)}
                />
              </View>

              {isDirectWeighing ? (
                <Button
                  mode="contained"
                  onPress={() => openWeightDialog(item.harvesterId)}
                  style={styles.weighButton}
                >
                  {strings.anotador.recordWeight}
                </Button>
              ) : (
                <View style={styles.buttonRow}>
                  <Button
                    mode="outlined"
                    onPress={() => recordDelivery(item.harvesterId, -1)}
                    style={styles.smallButton}
                  >
                    -1
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => recordDelivery(item.harvesterId, 1)}
                    style={styles.mainButton}
                  >
                    +1
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => recordDelivery(item.harvesterId, 2)}
                    style={styles.smallButton}
                  >
                    +2
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => recordDelivery(item.harvesterId, 5)}
                    style={styles.smallButton}
                  >
                    +5
                  </Button>
                </View>
              )}
            </View>
          );
        }}
      />

      <FAB
        icon="account-plus"
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/workday/[id]/add-harvester',
            params: { id: workdayId },
          })
        }
      />

      <Portal>
        <Dialog
          visible={weightDialogHarvesterId !== null}
          onDismiss={() => setWeightDialogHarvesterId(null)}
        >
          <Dialog.Title>{strings.anotador.recordWeight}</Dialog.Title>
          <Dialog.Content>
            <SegmentedButtons
              value={weightMode}
              onValueChange={(value) =>
                setWeightMode(value as 'add' | 'discount')
              }
              style={styles.weightModeToggle}
              buttons={[
                { value: 'add', label: strings.anotador.addWeight },
                { value: 'discount', label: strings.anotador.discountWeight },
              ]}
            />
            <TextInput
              label={strings.anotador.weightLabel}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWeightDialogHarvesterId(null)}>
              {strings.common.cancel}
            </Button>
            <Button onPress={submitWeight}>{strings.common.save}</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={infoHarvesterId !== null}
          onDismiss={() => setInfoHarvesterId(null)}
        >
          <Dialog.Title>
            {infoHarvester
              ? `${infoHarvester.firstName} ${infoHarvester.lastName}`
              : strings.anotador.roundsTitle}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.roundsScrollArea}>
            <ScrollView>
              {infoRounds.length === 0 ? (
                <Text style={styles.noRounds}>
                  {strings.anotador.noRoundsYet}
                </Text>
              ) : (
                infoRounds.map((round) => (
                  <View key={round.id} style={styles.roundRow}>
                    <Text variant="titleSmall">
                      {strings.anotador.round(round.roundNumber)}
                    </Text>
                    <Text>
                      {round.unitCount} {strings.anotador.units} ·{' '}
                      {round.totalKg.toFixed(2)} {strings.anotador.kg}
                    </Text>
                    <Text variant="bodySmall" style={styles.roundTime}>
                      {new Date(round.recordedAt).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setInfoHarvesterId(null)}>
              {strings.common.close}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: rowNumber usa el primary
// del tema activo (usePalette), así que los estilos deben recalcularse
// cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    grandTotal: { marginBottom: spacing.xs, fontWeight: '700' },
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    list: { paddingBottom: spacing.xl * 2 },
    row: {
      paddingVertical: spacing.lg,
      marginBottom: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    rowNumber: {
      width: spacing.lg,
      textAlign: 'center',
      color: colors.primary,
      fontWeight: '700',
    },
    rowHeaderText: { flex: 1, marginLeft: spacing.sm },
    rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
    buttonRow: { flexDirection: 'row', gap: spacing.sm },
    mainButton: {
      flex: 1,
      minHeight: TOUCH_TARGET_MIN,
      justifyContent: 'center',
    },
    smallButton: { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' },
    // A diferencia de -1/+1/+2/+5 (la acción más repetida de toda la app,
    // RNF-02, por eso TOUCH_TARGET_MIN), pesar es una acción más deliberada
    // que abre un diálogo — no necesita el mismo tamaño gigante, y
    // alignSelf:flex-start evita que se estire a lo ancho de toda la fila.
    weighButton: { alignSelf: 'flex-start' },
    weightModeToggle: { marginBottom: spacing.md },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
    roundsScrollArea: { maxHeight: 320 },
    roundRow: {
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    roundTime: { color: colors.textSecondary, marginTop: spacing.xs },
    noRounds: { paddingVertical: spacing.md },
  });
}

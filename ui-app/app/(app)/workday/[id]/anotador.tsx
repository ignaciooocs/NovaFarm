import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { eq, sql } from 'drizzle-orm';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import type { FindHarvesterResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvestEntries, harvesterWorkday, workdays } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { generateLocalId } from '@/lib/id';
import { spacing, TOUCH_TARGET_MIN } from '@/theme';

interface RosterRow {
  id: string;
  harvesterId: string;
  workdayNumber: number;
}

interface EntryTotal {
  unitCount: number;
  totalKg: number;
}

// Roster + registro real (RF-02): tocar +1/+2/+5/-1 escribe local al tiro
// (RNF-01, sin esperar la base ni la red — el estado se actualiza primero,
// la escritura a SQLite corre atrás). Si la unidad por defecto de la
// jornada tiene kgFactor = 1 (modo pesaje directo, RF-03.2), en vez de los
// botones se pide el peso exacto por diálogo.
export default function AnotadorScreen() {
  const router = useRouter();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [harvestersById, setHarvestersById] = useState<
    Record<string, FindHarvesterResponseDto>
  >({});
  const [totalsByHarvester, setTotalsByHarvester] = useState<
    Record<string, EntryTotal>
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

      const { measurementUnitsControllerFindAll } = getMeasurementUnits();
      const { harvestersControllerFindAll } = getHarvesters();
      const [units, harvestersResult, rosterRows, totalsRows] =
        await Promise.all([
          measurementUnitsControllerFindAll(),
          harvestersControllerFindAll(),
          db
            .select()
            .from(harvesterWorkday)
            .where(eq(harvesterWorkday.workdayId, workdayId)),
          db
            .select({
              harvesterId: harvestEntries.harvesterId,
              unitCount: sql<number>`sum(${harvestEntries.unitCount})`,
              totalKg: sql<number>`sum(${harvestEntries.totalKg})`,
            })
            .from(harvestEntries)
            .where(eq(harvestEntries.workdayId, workdayId))
            .groupBy(harvestEntries.harvesterId),
        ]);

      const unit = units.find(
        (candidate) => candidate._id === workdayRow.defaultMeasurementUnitId,
      );
      setDefaultUnit(
        unit
          ? { id: unit._id, name: unit.name, kgFactor: unit.kgFactor }
          : null,
      );

      const byId: Record<string, FindHarvesterResponseDto> = {};
      harvestersResult.forEach((harvester) => {
        byId[harvester._id] = harvester;
      });
      setHarvestersById(byId);

      const totals: Record<string, EntryTotal> = {};
      totalsRows.forEach((row) => {
        totals[row.harvesterId] = {
          unitCount: row.unitCount,
          totalKg: row.totalKg,
        };
      });
      setTotalsByHarvester(totals);

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

    // Actualiza la UI al tiro (RNF-01) — la escritura a SQLite sigue en
    // paralelo, sin bloquear el próximo toque.
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

    db.insert(harvestEntries)
      .values({
        id: generateLocalId(),
        workdayId,
        harvesterId,
        measurementUnitId: defaultUnit.id,
        unitCount,
        totalKg: totalKgDelta,
        recordedAt: new Date().toISOString(),
        synced: false,
      })
      .catch((err) => {
        // Rara vez falla una escritura local, pero si pasa hay que revertir
        // el total optimista — no dejar la UI mostrando algo que no quedó
        // guardado.
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
        setError(getErrorMessage(err));
      });
  }

  function openWeightDialog(harvesterId: string) {
    setWeightInput('');
    setWeightDialogHarvesterId(harvesterId);
  }

  function submitWeight() {
    const value = Number(weightInput.replace(',', '.'));
    if (!weightDialogHarvesterId || !value || value <= 0) {
      return;
    }
    recordDelivery(weightDialogHarvesterId, value);
    setWeightDialogHarvesterId(null);
  }

  const grandTotalKg = Object.values(totalsByHarvester).reduce(
    (sum, entry) => sum + entry.totalKg,
    0,
  );
  const isDirectWeighing = defaultUnit?.kgFactor === 1;

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
        {strings.anotador.title}
      </Text>
      <Text variant="titleMedium" style={styles.grandTotal}>
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
        renderItem={({ item }) => {
          const harvester = harvestersById[item.harvesterId];
          const totals = totalsByHarvester[item.harvesterId] ?? {
            unitCount: 0,
            totalKg: 0,
          };
          const label = harvester
            ? `${item.workdayNumber}. ${harvester.firstName} ${harvester.lastName}`
            : `${item.workdayNumber}. ...`;

          return (
            <View style={styles.row}>
              <Text variant="titleMedium">{label}</Text>
              <Text style={styles.rowTotal}>
                {totals.unitCount} {strings.anotador.units} ·{' '}
                {totals.totalKg.toFixed(2)} {strings.anotador.kg}
              </Text>

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
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xs },
  grandTotal: { marginBottom: spacing.xs },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000022',
  },
  rowTotal: { marginBottom: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  mainButton: { flex: 1, minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' },
  smallButton: { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' },
  weighButton: { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
});

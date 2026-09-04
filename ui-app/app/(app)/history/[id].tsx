import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, HelperText, Text } from 'react-native-paper';
import { getHarvestEntries } from '@/api/generated/harvest-entries/harvest-entries';
import { getHarvesterWorkday } from '@/api/generated/harvester-workday/harvester-workday';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_FRUIT_ICON } from '@/constants/fruitIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { fruits, harvesters as harvestersTable } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

interface RosterRow {
  harvesterId: string;
  workdayNumber: number;
  name: string;
  unitCount: number;
  totalKg: number;
}

interface WorkdayDetail {
  fruitName: string;
  fruitIcon: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  recorderName?: string;
  totalKg: number;
  roster: RosterRow[];
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

  const [detail, setDetail] = useState<WorkdayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        setLoading(true);
        setError(null);
        try {
          const { workdaysControllerFindAll } = getWorkdays();
          const { harvestEntriesControllerFindAll } = getHarvestEntries();
          const { harvesterWorkdayControllerFindAll } = getHarvesterWorkday();

          const [allWorkdays, entryRows, rosterRows, fruitRows, harvestersRows] =
            await Promise.all([
              // Sin filtro de status: esta pantalla también se usa para ver
              // la jornada ABIERTA de alguien desde Mi equipo, no solo
              // jornadas cerradas del Historial.
              workdaysControllerFindAll({}),
              harvestEntriesControllerFindAll({ workdayId: workdayServerId }),
              harvesterWorkdayControllerFindAll({ workdayId: workdayServerId }),
              db.select().from(fruits),
              db.select().from(harvestersTable),
            ]);
          if (cancelled) {
            return;
          }

          const workday = allWorkdays.find((w) => w._id === workdayServerId);
          if (!workday) {
            setError(strings.errors.generic);
            return;
          }

          const fruitsById: Record<string, { name: string; icon: string }> =
            {};
          fruitRows.forEach((fruit) => {
            fruitsById[fruit.id] = {
              name: fruit.name,
              icon: fruit.icon ?? DEFAULT_FRUIT_ICON,
            };
          });
          const harvesterNamesById: Record<string, string> = {};
          harvestersRows.forEach((harvester) => {
            harvesterNamesById[harvester.id] =
              `${harvester.firstName} ${harvester.lastName}`;
          });

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

          const fruit = fruitsById[workday.fruitId];
          setDetail({
            fruitName: fruit?.name ?? workday.fruitId,
            fruitIcon: fruit?.icon ?? DEFAULT_FRUIT_ICON,
            date: workday.date,
            status: workday.status,
            recorderName: workday.recorderName,
            totalKg:
              workday.finalTotalKg ??
              roster.reduce((sum, row) => sum + row.totalKg, 0),
            roster,
          });
        } catch (err) {
          if (!cancelled) {
            setError(getErrorMessage(err));
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [workdayServerId]),
  );

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <HelperText type="error">{error ?? strings.errors.generic}</HelperText>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${detail.fruitIcon} ${detail.fruitName}`,
        }}
      />

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
              {detail.totalKg.toFixed(2)}
              <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
            </Text>

            <Text style={styles.metaText}>
              {strings.history.workersCount(detail.roster.length)}
            </Text>

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>{strings.history.team}</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyRoster}>{strings.admin.emptyList}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.rosterRow}>
            <Text style={styles.rosterNumber}>{item.workdayNumber}</Text>
            <Text style={styles.rosterName}>{item.name}</Text>
            <Text style={styles.rosterTotal}>
              {item.unitCount} {strings.anotador.units} ·{' '}
              {item.totalKg.toFixed(2)} {strings.anotador.kg}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: rosterNumber usa el
// primary del tema activo (usePalette), así que los estilos deben
// recalcularse cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
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
    metaText: { color: colors.textSecondary, marginBottom: spacing.lg },
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
    rosterTotal: { color: colors.textSecondary },
    emptyRoster: { paddingVertical: spacing.md, color: colors.textSecondary },
  });
}

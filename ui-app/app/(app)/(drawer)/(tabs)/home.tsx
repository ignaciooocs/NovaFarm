import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { DEFAULT_FRUIT_ICON } from '@/constants/fruitIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import {
  fruits,
  harvesters as harvestersTable,
  harvestEntries,
  harvesterWorkday,
  workdays,
} from '@/db/schema';
import { syncCatalogs } from '@/lib/catalogSync';
import { syncFarmSettings } from '@/lib/farmSettings';
import { useActiveWorkdayStore, useAuthStore, usePalette } from '@/stores';
import { spacing } from '@/theme';

interface RosterPreviewRow {
  harvesterId: string;
  workdayNumber: number;
  name: string;
  totalKg: number;
}

interface ActiveWorkdayPreview {
  id: string;
  fruitName: string;
  fruitIcon: string;
  date: string;
  grandTotalKg: number;
  pendingCount: number;
  roster: RosterPreviewRow[];
}

const ROSTER_PREVIEW_LIMIT = 5;

// Home es la pantalla de aterrizaje de cada apertura de la app, así que
// también es el punto natural "ya-online" del ciclo para refrescar la caché
// local de catálogos y el interruptor de la farm (fire-and-forget, no
// bloquea el render de abajo).
async function loadActiveWorkdayPreview(
  workdayId: string,
): Promise<ActiveWorkdayPreview> {
  const [workdayRows, fruitRows, harvestersRows, rosterRows, entryRows] =
    await Promise.all([
      db.select().from(workdays).where(eq(workdays.id, workdayId)),
      db.select().from(fruits),
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
  const workdayRow = workdayRows[0];

  const fruitsById: Record<string, { name: string; icon: string }> = {};
  fruitRows.forEach((fruit) => {
    fruitsById[fruit.id] = {
      name: fruit.name,
      icon: fruit.icon ?? DEFAULT_FRUIT_ICON,
    };
  });
  const harvesterNamesById: Record<string, string> = {};
  harvestersRows.forEach((harvester) => {
    harvesterNamesById[harvester.id] = `${harvester.firstName} ${harvester.lastName}`;
  });

  const totalKgByHarvester: Record<string, number> = {};
  let grandTotalKg = 0;
  let pendingCount = 0;
  entryRows.forEach((entry) => {
    totalKgByHarvester[entry.harvesterId] =
      (totalKgByHarvester[entry.harvesterId] ?? 0) + entry.totalKg;
    grandTotalKg += entry.totalKg;
    if (!entry.synced) {
      pendingCount += 1;
    }
  });
  rosterRows.forEach((row) => {
    if (!row.synced) {
      pendingCount += 1;
    }
  });

  const roster = rosterRows
    .map((row) => ({
      harvesterId: row.harvesterId,
      workdayNumber: row.workdayNumber,
      name: harvesterNamesById[row.harvesterId] ?? '...',
      totalKg: totalKgByHarvester[row.harvesterId] ?? 0,
    }))
    .sort((a, b) => a.workdayNumber - b.workdayNumber);

  const fruit = workdayRow ? fruitsById[workdayRow.fruitId] : undefined;

  return {
    id: workdayId,
    fruitName: fruit?.name ?? '',
    fruitIcon: fruit?.icon ?? DEFAULT_FRUIT_ICON,
    date: workdayRow?.date ?? '',
    grandTotalKg,
    pendingCount,
    roster,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const uid = useAuthStore((state) => state.user?.uid);
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [preview, setPreview] = useState<ActiveWorkdayPreview | null>(null);
  const [loading, setLoading] = useState(true);

  // useFocusEffect: al volver de cerrar/abrir una jornada (u otra pantalla)
  // Home sigue montado en el stack, hay que revisar de nuevo cada vez que
  // vuelve a tener foco, no solo al montarse.
  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        return;
      }

      syncCatalogs();
      syncFarmSettings();

      let cancelled = false;

      (async () => {
        setLoading(true);
        const workday = await getActiveWorkday(uid);
        if (cancelled) {
          return;
        }
        setActiveWorkdayId(workday?.id ?? null);

        if (!workday) {
          setPreview(null);
          setLoading(false);
          return;
        }

        const loaded = await loadActiveWorkdayPreview(workday.id);
        if (cancelled) {
          return;
        }
        setPreview(loaded);
        setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [uid, setActiveWorkdayId]),
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
        </View>
      ) : preview ? (
        <>
          <View style={styles.content}>
            <Text style={styles.eyebrow}>{strings.home.activeWorkday}</Text>
            <Text variant="titleLarge" style={styles.fruitName}>
              {preview.fruitIcon} {preview.fruitName}
            </Text>
            <Text style={styles.dateText}>
              {new Date(preview.date).toLocaleDateString('es-CL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>

            <Text style={styles.totalLabel}>{strings.workday.totalKg}</Text>
            <Text style={styles.totalValue}>
              {preview.grandTotalKg.toFixed(2)}
              <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {strings.home.workersCount(preview.roster.length)}
              </Text>
              <Text
                style={[
                  styles.metaText,
                  preview.pendingCount > 0 ? styles.pendingWarning : null,
                ]}
              >
                {preview.pendingCount === 0
                  ? strings.sync.synced
                  : strings.sync.pendingCount(preview.pendingCount)}
              </Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>{strings.home.todayTeam}</Text>
            {preview.roster.length === 0 ? (
              <Text style={styles.emptyRoster}>{strings.admin.emptyList}</Text>
            ) : (
              preview.roster.slice(0, ROSTER_PREVIEW_LIMIT).map((row) => (
                <View key={row.harvesterId} style={styles.rosterRow}>
                  <Text style={styles.rosterNumber}>{row.workdayNumber}</Text>
                  <Text style={styles.rosterName}>{row.name}</Text>
                  <Text style={styles.rosterTotal}>
                    {row.totalKg.toFixed(2)} {strings.anotador.kg}
                  </Text>
                </View>
              ))
            )}
            {preview.roster.length > ROSTER_PREVIEW_LIMIT ? (
              <Text style={styles.moreWorkers}>
                {strings.home.moreWorkers(
                  preview.roster.length - ROSTER_PREVIEW_LIMIT,
                )}
              </Text>
            ) : null}
          </View>

          <Button
            mode="contained"
            onPress={() =>
              router.push({
                pathname: '/workday/[id]/anotador',
                params: { id: preview.id },
              })
            }
          >
            {strings.home.goToAnotador}
          </Button>
        </>
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyStateText}>
            {strings.home.noActiveWorkday}
          </Text>
          <Button mode="contained" onPress={() => router.push('/open-workday')}>
            {strings.home.openWorkday}
          </Button>
        </View>
      )}
    </Screen>
  );
}

// Función en vez de un StyleSheet.create() estático a nivel de módulo:
// `colors.primary` cambia según el tema elegido en Ajustes (usePalette), así
// que los estilos que lo usan (eyebrow, rosterNumber) tienen que recalcularse
// cuando cambia — un objeto fijo calculado una sola vez al importar el
// archivo se quedaría pegado en el tema con el que arrancó la app.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyStateText: { color: colors.textSecondary },
  content: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  fruitName: { fontWeight: '700' },
  dateText: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textTransform: 'capitalize',
  },
  totalLabel: { color: colors.textSecondary, fontSize: 13 },
  totalValue: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 40,
    lineHeight: 46,
    marginBottom: spacing.sm,
  },
  totalUnit: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  metaRow: { marginBottom: spacing.lg, gap: spacing.xs / 2 },
  metaText: { color: colors.textSecondary },
  pendingWarning: { color: colors.warning, fontWeight: '600' },
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
  emptyRoster: { paddingVertical: spacing.sm, color: colors.textSecondary },
  moreWorkers: { color: colors.textSecondary, paddingTop: spacing.sm },
  });
}

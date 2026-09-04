import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type {
  FindFruitResponseDto,
  FindMeasurementUnitResponseDto,
} from '@/api/generated/anotaYaAPI.schemas';
import { getFruits } from '@/api/generated/fruits/fruits';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import { workdays } from '@/db/schema';
import { generateLocalId } from '@/lib/id';
import { getErrorMessage } from '@/lib/errors';
import { useActiveWorkdayStore, useAuthStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

export default function OpenWorkdayScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const uid = useAuthStore((state) => state.user?.uid);
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );

  // Generado una sola vez por visita a esta pantalla (no en cada submit) y
  // reusado en cada reintento — si el primer POST se cae después de que el
  // server ya creó la jornada pero antes de que la respuesta llegue, un
  // segundo tap con el mismo clientEntryId es idempotente en vez de abrir
  // una jornada duplicada (ver el gap de idempotencia documentado en
  // docs/diagrams/ui-arquitectura.md). También es el id de la fila local.
  const [clientEntryId] = useState(() => generateLocalId());

  // true hasta confirmar que no hay otra jornada ya abierta — se asume un
  // dispositivo trabajando una jornada a la vez (modelo-datos.md); si ya
  // hay una, se redirige a esa en vez de dejar abrir una segunda.
  const [checkingActive, setCheckingActive] = useState(true);

  const [fruits, setFruits] = useState<FindFruitResponseDto[]>([]);
  const [units, setUnits] = useState<FindMeasurementUnitResponseDto[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [fruitId, setFruitId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    async function checkActive() {
      const activeWorkday = await getActiveWorkday(uid!);
      if (activeWorkday) {
        router.replace({
          pathname: '/workday/[id]/anotador',
          params: { id: activeWorkday.id },
        });
        return;
      }
      setCheckingActive(false);
    }

    checkActive();
  }, [router, uid]);

  useEffect(() => {
    if (checkingActive) {
      return;
    }

    async function loadCatalogs() {
      setLoadingCatalogs(true);
      try {
        const { fruitsControllerFindAll } = getFruits();
        const { measurementUnitsControllerFindAll } = getMeasurementUnits();
        const [fruitsResult, unitsResult] = await Promise.all([
          fruitsControllerFindAll(),
          measurementUnitsControllerFindAll(),
        ]);
        setFruits(fruitsResult.filter((fruit) => fruit.active));
        setUnits(unitsResult.filter((unit) => unit.active));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingCatalogs(false);
      }
    }

    loadCatalogs();
  }, [checkingActive]);

  const canSubmit = Boolean(fruitId) && Boolean(unitId) && !saving;

  const todayLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  async function handleSubmit() {
    if (!fruitId || !unitId || !uid) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const { workdaysControllerCreate } = getWorkdays();
      const result = await workdaysControllerCreate({
        clientEntryId,
        date: new Date().toISOString(),
        fruitId,
        defaultMeasurementUnitId: unitId,
      });

      // La jornada se abre online (server-app ahora hace upsert por
      // clientEntryId, así que un reintento con el mismo clientEntryId
      // siempre vuelve al mismo resultado) — una vez que el server confirma,
      // se espeja localmente para que el resto de la app (Anotador, sync)
      // siempre lea de SQLite, sin importar si el dato vino online u offline.
      // El id local es el mismo clientEntryId que se mandó — si esta
      // pantalla se remonta y este insert corre dos veces para la misma
      // jornada, la segunda es un no-op sobre la misma fila en vez de una
      // fila duplicada.
      await db
        .insert(workdays)
        .values({
          id: clientEntryId,
          serverId: result._id,
          farmId: result.farmId,
          date: result.date,
          fruitId: result.fruitId,
          defaultMeasurementUnitId: result.defaultMeasurementUnitId,
          status: result.status,
          finalTotalKg: result.finalTotalKg ?? null,
          synced: true,
          createdAt: result.createdAt,
          createdByUid: uid,
        })
        .onConflictDoNothing();

      setActiveWorkdayId(clientEntryId);
      router.replace({
        pathname: '/workday/[id]/anotador',
        params: { id: clientEntryId },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (checkingActive || loadingCatalogs) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (fruits.length === 0 || units.length === 0) {
    const missingFruits = fruits.length === 0;
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.workday.openTitle }}
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{missingFruits ? '🍇' : '📦'}</Text>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {missingFruits
              ? strings.admin.fruitsTitle
              : strings.admin.measurementUnitsTitle}
          </Text>
          <Text style={styles.emptyHelper}>{strings.admin.emptyList}</Text>
          <Button
            mode="contained"
            onPress={() =>
              router.push(missingFruits ? '/fruits' : '/measurement-units')
            }
            buttonColor={palette.primary}
            contentStyle={styles.buttonContent}
            style={styles.button}
          >
            {missingFruits
              ? strings.admin.newFruit
              : strings.admin.newMeasurementUnit}
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.workday.openTitle }}
      />

      <Text style={styles.dateLabel}>{todayLabel}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="labelLarge" style={styles.sectionLabel}>
          {strings.workday.fruit}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fruitRow}
        >
          {fruits.map((fruit) => {
            const selected = fruit._id === fruitId;
            return (
              <TouchableRipple
                key={fruit._id}
                onPress={() => setFruitId(fruit._id)}
                style={[styles.fruitTile, selected && styles.fruitTileSelected]}
              >
                <View style={styles.fruitTileBody}>
                  <Text style={styles.fruitEmoji}>{fruit.icon}</Text>
                  <Text
                    style={[
                      styles.fruitName,
                      selected && styles.fruitNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {fruit.name}
                  </Text>
                </View>
              </TouchableRipple>
            );
          })}
        </ScrollView>

        <Text variant="labelLarge" style={styles.sectionLabel}>
          {strings.workday.measurementUnit}
        </Text>
        <OptionSelector
          value={unitId}
          onChange={setUnitId}
          style={styles.unitSelector}
          options={units.map((unit) => ({
            value: unit._id,
            short: unit.name,
            description: strings.admin.unitEquivalence(
              unit.name,
              unit.kgFactor,
            ),
          }))}
        />
      </ScrollView>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={saving}
        disabled={!canSubmit}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.workday.open}
      </Button>
    </Screen>
  );
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    dateLabel: {
      color: colors.textSecondary,
      fontSize: 16,
      textTransform: 'capitalize',
      marginBottom: spacing.md,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.md },
    sectionLabel: { marginBottom: spacing.sm, color: colors.textSecondary },
    // Fila horizontal deslizable en vez de una grilla que envuelve — con
    // varias frutas ocupaba demasiado alto de la pantalla antes de llegar
    // siquiera a la unidad de medida (pedido del usuario, 2026-09-03).
    fruitRow: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
      marginBottom: spacing.lg,
      alignItems: 'flex-start',
    },
    fruitTile: {
      width: 84,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    fruitTileSelected: {
      backgroundColor: palette.primarySoft,
      borderColor: palette.primary,
    },
    fruitTileBody: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    fruitEmoji: { fontSize: 28, marginBottom: 2 },
    fruitName: { fontWeight: 'bold', fontSize: 12, textAlign: 'center' },
    fruitNameSelected: { color: palette.primary },
    unitSelector: { marginBottom: spacing.md },
    buttonContent: { paddingVertical: spacing.xs },
    button: { marginTop: spacing.sm, borderRadius: 12 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: { marginBottom: spacing.xs },
    emptyHelper: {
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
  });
}

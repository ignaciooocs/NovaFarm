import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Menu,
  Text,
} from 'react-native-paper';
import type {
  FindFruitResponseDto,
  FindMeasurementUnitResponseDto,
} from '@/api/generated/anotaYaAPI.schemas';
import { getFruits } from '@/api/generated/fruits/fruits';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { getActiveWorkday } from '@/db/queries';
import { workdays } from '@/db/schema';
import { generateLocalId } from '@/lib/id';
import { getErrorMessage } from '@/lib/errors';
import { useActiveWorkdayStore, useAuthStore } from '@/stores';
import { spacing } from '@/theme';

export default function OpenWorkdayScreen() {
  const router = useRouter();
  const uid = useAuthStore((state) => state.user?.uid);
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );

  // true hasta confirmar que no hay otra jornada ya abierta — se asume un
  // dispositivo trabajando una jornada a la vez (modelo-datos.md); si ya
  // hay una, se redirige a esa en vez de dejar abrir una segunda.
  const [checkingActive, setCheckingActive] = useState(true);

  const [fruits, setFruits] = useState<FindFruitResponseDto[]>([]);
  const [units, setUnits] = useState<FindMeasurementUnitResponseDto[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [fruitId, setFruitId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [fruitMenuOpen, setFruitMenuOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);

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

  const selectedFruit = fruits.find((fruit) => fruit._id === fruitId);
  const selectedUnit = units.find((unit) => unit._id === unitId);
  const canSubmit = Boolean(fruitId) && Boolean(unitId) && !saving;

  async function handleSubmit() {
    if (!fruitId || !unitId || !uid) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const { workdaysControllerCreate } = getWorkdays();
      const result = await workdaysControllerCreate({
        date: new Date().toISOString(),
        fruitId,
        defaultMeasurementUnitId: unitId,
      });

      // La jornada se abre online (ver el gap de idempotencia documentado en
      // docs/diagrams/ui-arquitectura.md) — una vez que el server confirma,
      // se espeja localmente para que el resto de la app (Anotador, sync)
      // siempre lea de SQLite, sin importar si el dato vino online u offline.
      const localId = generateLocalId();
      await db.insert(workdays).values({
        id: localId,
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
      });

      setActiveWorkdayId(localId);
      router.replace({
        pathname: '/workday/[id]/anotador',
        params: { id: localId },
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
    return (
      <Screen>
        <Text variant="headlineMedium" style={styles.title}>
          {strings.workday.openTitle}
        </Text>
        <Text style={styles.helper}>
          {fruits.length === 0
            ? `${strings.admin.fruitsTitle}: ${strings.admin.emptyList}`
            : `${strings.admin.measurementUnitsTitle}: ${strings.admin.emptyList}`}
        </Text>
        <Button
          mode="contained"
          onPress={() =>
            router.push(fruits.length === 0 ? '/fruits' : '/measurement-units')
          }
        >
          {fruits.length === 0
            ? strings.admin.newFruit
            : strings.admin.newMeasurementUnit}
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.workday.openTitle}
      </Text>

      <Menu
        visible={fruitMenuOpen}
        onDismiss={() => setFruitMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setFruitMenuOpen(true)}
            style={styles.selector}
          >
            {selectedFruit?.name ?? strings.workday.fruit}
          </Button>
        }
      >
        {fruits.map((fruit) => (
          <Menu.Item
            key={fruit._id}
            title={fruit.name}
            onPress={() => {
              setFruitId(fruit._id);
              setFruitMenuOpen(false);
            }}
          />
        ))}
      </Menu>

      <Menu
        visible={unitMenuOpen}
        onDismiss={() => setUnitMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setUnitMenuOpen(true)}
            style={styles.selector}
          >
            {selectedUnit?.name ?? strings.workday.measurementUnit}
          </Button>
        }
      >
        {units.map((unit) => (
          <Menu.Item
            key={unit._id}
            title={unit.name}
            onPress={() => {
              setUnitId(unit._id);
              setUnitMenuOpen(false);
            }}
          />
        ))}
      </Menu>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={saving}
        disabled={!canSubmit}
        style={styles.button}
      >
        {strings.workday.open}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  helper: { marginBottom: spacing.md },
  selector: { marginBottom: spacing.md, alignItems: 'flex-start' },
  button: { marginTop: spacing.sm },
});

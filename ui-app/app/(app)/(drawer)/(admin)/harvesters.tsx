import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { eq } from 'drizzle-orm';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import type { FindHarvesterResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvestEntries } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { useActiveWorkdayStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

interface TodayTotal {
  unitCount: number;
  totalKg: number;
}

export default function HarvestersScreen() {
  const palette = usePalette();
  const activeWorkdayId = useActiveWorkdayStore((state) => state.workdayId);
  const [harvesters, setHarvesters] = useState<FindHarvesterResponseDto[]>([]);
  // Cuánto lleva cada cosechador en la jornada activa DE ESTE DISPOSITIVO
  // (si hay una) — se pide siempre de SQLite local, nunca del server, mismo
  // criterio que el Anotador: es la captura de este dispositivo, no un
  // resumen de toda la farm. Vacío (sin jornada activa) o cuando el
  // cosechador todavía no tiene ninguna entrega hoy, simplemente no se
  // muestra la línea extra en su fila.
  const [todayTotalsByHarvester, setTodayTotalsByHarvester] = useState<
    Record<string, TodayTotal>
  >({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando un cosechador nuevo; con valor = editando ese cosechador
  // (mismo diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHarvesters() {
    setLoading(true);
    try {
      const { harvestersControllerFindAll } = getHarvesters();
      setHarvesters(await harvestersControllerFindAll());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // useFocusEffect (no un simple useEffect): al volver del Anotador después
  // de anotar entregas, esta pantalla sigue montada en el drawer — hay que
  // refrescar los totales de hoy cada vez que recupera foco, no solo al
  // montarse la primera vez.
  useFocusEffect(
    useCallback(() => {
      loadHarvesters();

      if (!activeWorkdayId) {
        setTodayTotalsByHarvester({});
        return;
      }

      (async () => {
        const entries = await db
          .select()
          .from(harvestEntries)
          .where(eq(harvestEntries.workdayId, activeWorkdayId));

        const totals: Record<string, TodayTotal> = {};
        entries.forEach((entry) => {
          const current = totals[entry.harvesterId] ?? {
            unitCount: 0,
            totalKg: 0,
          };
          totals[entry.harvesterId] = {
            unitCount: current.unitCount + entry.unitCount,
            totalKg: current.totalKg + entry.totalKg,
          };
        });
        setTodayTotalsByHarvester(totals);
      })();
    }, [activeWorkdayId]),
  );

  function openCreateDialog() {
    setError(null);
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setNickname('');
    setDialogOpen(true);
  }

  function openEditDialog(harvester: FindHarvesterResponseDto) {
    setError(null);
    setEditingId(harvester._id);
    setFirstName(harvester.firstName);
    setLastName(harvester.lastName);
    setNickname(harvester.nickname ?? '');
    setDialogOpen(true);
  }

  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const { harvestersControllerCreate, harvestersControllerUpdate } =
        getHarvesters();
      if (editingId) {
        // null explícito (no undefined) borra un apodo existente si el
        // campo quedó vacío — ver el comentario en harvesters.service.ts.
        await harvestersControllerUpdate(editingId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nickname: nickname.trim() || null,
        });
      } else {
        await harvestersControllerCreate({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nickname: nickname.trim() || undefined,
        });
      }
      setDialogOpen(false);
      await loadHarvesters();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Desactivar/reactivar es reversible y no afecta jornadas ya abiertas
  // (esas quedan referenciando el id igual, ver findActiveById en
  // server-app) — así que es un toggle directo, sin diálogo de confirmación.
  async function handleToggleActive(harvester: FindHarvesterResponseDto) {
    setTogglingId(harvester._id);
    setError(null);
    try {
      const { harvestersControllerUpdate } = getHarvesters();
      await harvestersControllerUpdate(harvester._id, {
        active: !harvester.active,
      });
      await loadHarvesters();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.harvestersTitle}
      </Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={harvesters}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => {
            const todayTotal = todayTotalsByHarvester[item._id];
            return (
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="titleMedium" numberOfLines={1}>
                    {item.nickname
                      ? `${item.firstName} ${item.lastName} ("${item.nickname}")`
                      : `${item.firstName} ${item.lastName}`}
                  </Text>
                  {!item.active ? (
                    <Text style={styles.rowSubtitle}>
                      {strings.common.inactive}
                    </Text>
                  ) : null}
                  {todayTotal ? (
                    <Text
                      style={[styles.rowSubtitle, { color: palette.primary }]}
                    >
                      {strings.admin.activeWorkdayEntries}:{' '}
                      {todayTotal.unitCount} {strings.anotador.units} ·{' '}
                      {todayTotal.totalKg.toFixed(2)} {strings.anotador.kg}
                    </Text>
                  ) : null}
                </View>
                {togglingId === item._id ? (
                  <ActivityIndicator
                    size="small"
                    style={styles.rowActivity}
                  />
                ) : (
                  <View style={styles.rowActions}>
                    <IconButton
                      icon="pencil"
                      accessibilityLabel={strings.common.edit}
                      onPress={() => openEditDialog(item)}
                    />
                    <IconButton
                      icon={item.active ? 'eye-off' : 'eye'}
                      accessibilityLabel={
                        item.active
                          ? strings.common.deactivate
                          : strings.common.activate
                      }
                      onPress={() => handleToggleActive(item)}
                    />
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openCreateDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>
            {editingId ? strings.admin.editHarvester : strings.admin.newHarvester}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={strings.admin.firstNameLabel}
              value={firstName}
              onChangeText={setFirstName}
              style={styles.input}
            />
            <TextInput
              label={strings.admin.lastNameLabel}
              value={lastName}
              onChangeText={setLastName}
              style={styles.input}
            />
            <TextInput
              label={strings.admin.nicknameLabel}
              value={nickname}
              onChangeText={setNickname}
            />
            {error ? <HelperText type="error">{error}</HelperText> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button onPress={handleSubmit} loading={saving} disabled={!canSubmit}>
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  input: { marginBottom: spacing.sm },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
  rowActions: { flexDirection: 'row' },
  rowActivity: { alignSelf: 'center', marginHorizontal: spacing.lg },
});

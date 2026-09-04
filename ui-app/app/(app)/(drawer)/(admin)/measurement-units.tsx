import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
import type { FindMeasurementUnitResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme';

export default function MeasurementUnitsScreen() {
  const [units, setUnits] = useState<FindMeasurementUnitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando una unidad nueva; con valor = editando esa unidad (mismo
  // diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kgFactor, setKgFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUnits() {
    setLoading(true);
    try {
      const { measurementUnitsControllerFindAll } = getMeasurementUnits();
      setUnits(await measurementUnitsControllerFindAll());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  function openCreateDialog() {
    setError(null);
    setEditingId(null);
    setName('');
    setKgFactor('');
    setDialogOpen(true);
  }

  function openEditDialog(unit: FindMeasurementUnitResponseDto) {
    setError(null);
    setEditingId(unit._id);
    setName(unit.name);
    setKgFactor(String(unit.kgFactor));
    setDialogOpen(true);
  }

  const parsedKgFactor = Number(kgFactor.replace(',', '.'));
  const canSubmit = name.trim().length > 0 && parsedKgFactor > 0 && !saving;

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const { measurementUnitsControllerCreate, measurementUnitsControllerUpdate } =
        getMeasurementUnits();
      if (editingId) {
        await measurementUnitsControllerUpdate(editingId, {
          name: name.trim(),
          kgFactor: parsedKgFactor,
        });
      } else {
        await measurementUnitsControllerCreate({
          name: name.trim(),
          kgFactor: parsedKgFactor,
        });
      }
      setDialogOpen(false);
      await loadUnits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Desactivar/reactivar es reversible y no afecta jornadas ya abiertas
  // (esas quedan referenciando el id igual, ver findActiveById en
  // server-app) — así que es un toggle directo, sin diálogo de confirmación.
  async function handleToggleActive(unit: FindMeasurementUnitResponseDto) {
    setTogglingId(unit._id);
    setError(null);
    try {
      const { measurementUnitsControllerUpdate } = getMeasurementUnits();
      await measurementUnitsControllerUpdate(unit._id, {
        active: !unit.active,
      });
      await loadUnits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.measurementUnitsTitle}
      </Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={units}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="titleMedium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {strings.admin.unitEquivalence(item.name, item.kgFactor)}
                  {!item.active ? ` · ${strings.common.inactive}` : ''}
                </Text>
              </View>
              {togglingId === item._id ? (
                <ActivityIndicator size="small" style={styles.rowActivity} />
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
          )}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openCreateDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>
            {editingId
              ? strings.admin.editMeasurementUnit
              : strings.admin.newMeasurementUnit}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={strings.admin.unitNameLabel}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <TextInput
              label={strings.admin.kgFactorLabel}
              value={kgFactor}
              onChangeText={setKgFactor}
              keyboardType="decimal-pad"
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

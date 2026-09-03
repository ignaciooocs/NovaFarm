import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  List,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import type { FindMeasurementUnitResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

export default function MeasurementUnitsScreen() {
  const [units, setUnits] = useState<FindMeasurementUnitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [kgFactor, setKgFactor] = useState('');
  const [saving, setSaving] = useState(false);
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

  function openDialog() {
    setError(null);
    setName('');
    setKgFactor('');
    setDialogOpen(true);
  }

  const parsedKgFactor = Number(kgFactor.replace(',', '.'));
  const canSubmit =
    name.trim().length > 0 && parsedKgFactor > 0 && !saving;

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const { measurementUnitsControllerCreate } = getMeasurementUnits();
      await measurementUnitsControllerCreate({
        name: name.trim(),
        kgFactor: parsedKgFactor,
      });
      setDialogOpen(false);
      await loadUnits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
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
            <List.Item
              title={item.name}
              description={
                `${item.kgFactor} kg` +
                (item.active ? '' : ` · ${strings.common.inactive}`)
              }
            />
          )}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>{strings.admin.newMeasurementUnit}</Dialog.Title>
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
            <Button onPress={handleCreate} loading={saving} disabled={!canSubmit}>
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
});

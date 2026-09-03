import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  List,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import type { FindFruitResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getFruits } from '@/api/generated/fruits/fruits';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

export default function FruitsScreen() {
  const [fruits, setFruits] = useState<FindFruitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando una fruta nueva; con valor = editando esa fruta (mismo
  // diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadFruits() {
    setLoading(true);
    try {
      const { fruitsControllerFindAll } = getFruits();
      setFruits(await fruitsControllerFindAll());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFruits();
  }, []);

  function openCreateDialog() {
    setError(null);
    setEditingId(null);
    setName('');
    setDialogOpen(true);
  }

  function openEditDialog(fruit: FindFruitResponseDto) {
    setError(null);
    setEditingId(fruit._id);
    setName(fruit.name);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const { fruitsControllerCreate, fruitsControllerUpdate } = getFruits();
      if (editingId) {
        await fruitsControllerUpdate(editingId, { name: name.trim() });
      } else {
        await fruitsControllerCreate({ name: name.trim() });
      }
      setDialogOpen(false);
      await loadFruits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Desactivar/reactivar es reversible y no afecta jornadas ya abiertas
  // (esas quedan referenciando el id igual, ver findActiveById en
  // server-app) — así que es un toggle directo, sin diálogo de confirmación.
  async function handleToggleActive(fruit: FindFruitResponseDto) {
    setTogglingId(fruit._id);
    setError(null);
    try {
      const { fruitsControllerUpdate } = getFruits();
      await fruitsControllerUpdate(fruit._id, { active: !fruit.active });
      await loadFruits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.fruitsTitle}
      </Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={fruits}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={item.active ? undefined : strings.common.inactive}
              right={() =>
                togglingId === item._id ? (
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
                )
              }
            />
          )}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openCreateDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>
            {editingId ? strings.admin.editFruit : strings.admin.newFruit}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={strings.common.name}
              value={name}
              onChangeText={setName}
            />
            {error ? <HelperText type="error">{error}</HelperText> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleSubmit}
              loading={saving}
              disabled={!name.trim() || saving}
            >
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
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  rowActions: { flexDirection: 'row' },
  rowActivity: { alignSelf: 'center', marginHorizontal: spacing.lg },
});

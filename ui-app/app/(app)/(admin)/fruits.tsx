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
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
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

  function openDialog() {
    setError(null);
    setName('');
    setDialogOpen(true);
  }

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const { fruitsControllerCreate } = getFruits();
      await fruitsControllerCreate({ name: name.trim() });
      setDialogOpen(false);
      await loadFruits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
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
            />
          )}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>{strings.admin.newFruit}</Dialog.Title>
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
              onPress={handleCreate}
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
});

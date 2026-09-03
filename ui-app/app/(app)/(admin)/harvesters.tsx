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
import type { FindHarvesterResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

export default function HarvestersScreen() {
  const [harvesters, setHarvesters] = useState<FindHarvesterResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    loadHarvesters();
  }, []);

  function openDialog() {
    setError(null);
    setFirstName('');
    setLastName('');
    setNickname('');
    setDialogOpen(true);
  }

  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const { harvestersControllerCreate } = getHarvesters();
      await harvestersControllerCreate({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim() || undefined,
      });
      setDialogOpen(false);
      await loadHarvesters();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
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
          renderItem={({ item }) => (
            <List.Item
              title={
                item.nickname
                  ? `${item.firstName} ${item.lastName} ("${item.nickname}")`
                  : `${item.firstName} ${item.lastName}`
              }
              description={item.active ? undefined : strings.common.inactive}
            />
          )}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={openDialog} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)}>
          <Dialog.Title>{strings.admin.newHarvester}</Dialog.Title>
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

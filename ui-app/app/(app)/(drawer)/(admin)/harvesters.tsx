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

  useEffect(() => {
    loadHarvesters();
  }, []);

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
          renderItem={({ item }) => (
            <List.Item
              title={
                item.nickname
                  ? `${item.firstName} ${item.lastName} ("${item.nickname}")`
                  : `${item.firstName} ${item.lastName}`
              }
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
  rowActions: { flexDirection: 'row' },
  rowActivity: { alignSelf: 'center', marginHorizontal: spacing.lg },
});

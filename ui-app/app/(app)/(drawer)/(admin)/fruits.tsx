import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
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
import type { FindFruitResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getFruits } from '@/api/generated/fruits/fruits';
import { Screen } from '@/components/Screen';
import { DEFAULT_FRUIT_ICON } from '@/constants/fruitIcon';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

// Grilla de 2 columnas (RF-03.3 + pasada de UI/UX pedida por el usuario,
// 2026-09-03): cada fruta es un ítem cuadrado con su emoji, sin cards ni
// relleno — ver "Preferencias de diseño" en ui-arquitectura.md, acá se
// interpreta como separación por espaciado en vez de una caja de fondo,
// igual que una grilla de íconos de apps. Tocar un ítem abre el diálogo de
// edición (nombre + emoji); el ícono de ojo en la esquina sigue siendo el
// toggle directo de activar/desactivar (sin diálogo, reversible), igual que
// antes de este rediseño.
export default function FruitsScreen() {
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [fruits, setFruits] = useState<FindFruitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando una fruta nueva; con valor = editando esa fruta (mismo
  // diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_FRUIT_ICON);
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
    setIcon(DEFAULT_FRUIT_ICON);
    setDialogOpen(true);
  }

  function openEditDialog(fruit: FindFruitResponseDto) {
    setError(null);
    setEditingId(fruit._id);
    setName(fruit.name);
    setIcon(fruit.icon);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const { fruitsControllerCreate, fruitsControllerUpdate } = getFruits();
      // Emoji en blanco = dejarlo como estaba al editar, o dejar que el
      // server aplique su propio default al crear — nunca se manda un
      // string vacío (el server lo rechaza con @IsNotEmpty igual que name).
      const trimmedIcon = icon.trim() || undefined;
      if (editingId) {
        await fruitsControllerUpdate(editingId, {
          name: name.trim(),
          icon: trimmedIcon,
        });
      } else {
        await fruitsControllerCreate({ name: name.trim(), icon: trimmedIcon });
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

      {error ? <HelperText type="error">{error}</HelperText> : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={fruits}
          keyExtractor={(item) => item._id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => (
            <View style={styles.tile}>
              <Pressable
                onPress={() => openEditDialog(item)}
                style={styles.tileBody}
              >
                <View style={item.active ? undefined : styles.tileInactive}>
                  <Text style={styles.tileEmoji}>{item.icon}</Text>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {!item.active ? (
                    <Text style={styles.tileInactiveLabel}>
                      {strings.common.inactive}
                    </Text>
                  ) : null}
                </View>
              </Pressable>

              {togglingId === item._id ? (
                <ActivityIndicator size="small" style={styles.tileToggle} />
              ) : (
                <IconButton
                  icon={item.active ? 'eye-off' : 'eye'}
                  size={18}
                  style={styles.tileToggle}
                  accessibilityLabel={
                    item.active
                      ? strings.common.deactivate
                      : strings.common.activate
                  }
                  onPress={() => handleToggleActive(item)}
                />
              )}
            </View>
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
            <View style={styles.iconRow}>
              <Text style={styles.iconPreview}>
                {icon.trim() || DEFAULT_FRUIT_ICON}
              </Text>
              <TextInput
                label={strings.admin.fruitIconLabel}
                value={icon}
                onChangeText={setIcon}
                style={styles.iconInput}
                maxLength={8}
              />
            </View>
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

// Función en vez de StyleSheet.create() estático: el fondo del tile usa el
// primary del tema activo (usePalette), así que los estilos deben
// recalcularse cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    title: { marginBottom: spacing.md },
    gridRow: { justifyContent: 'space-around' },
    tile: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      // Mismo tono suave (12% de opacidad) que ya usa el Drawer para su
      // ítem activo — ver `primarySoft` en usePalette(). Primera versión
      // llevaba además un borde sólido del color de marca; el usuario lo
      // sacó después de probarlo (2026-09-03) — el fondo solo se veía mejor.
      backgroundColor: colors.primarySoft,
      borderRadius: 20,
    },
    tileBody: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    tileEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.xs },
    tileName: { textAlign: 'center', paddingHorizontal: spacing.sm, fontWeight: 'bold' },
    tileInactive: { opacity: 0.4, alignItems: 'center' },
    tileInactiveLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    tileToggle: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    iconPreview: { fontSize: 40, marginRight: spacing.md },
    iconInput: { flex: 1 },
  });
}

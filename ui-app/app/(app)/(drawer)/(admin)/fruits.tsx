import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  Divider,
  FAB,
  HelperText,
  IconButton,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import type { FindFruitResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { getFruits } from '@/api/generated/fruits/fruits';
import { Screen } from '@/components/Screen';
import { DEFAULT_FRUIT_ICON } from '@/constants/fruitIcon';
import { strings } from '@/constants/strings';
import { SUGGESTED_FRUITS, type SuggestedFruit } from '@/constants/suggestedFruits';
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
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(
    null,
  );
  // Confirmar antes de crear — un chip es fácil de tocar sin querer al lado
  // de la grilla real, y a diferencia de activar/desactivar (reversible de
  // un toque) esto crea una fila nueva de verdad.
  const [confirmingSuggestion, setConfirmingSuggestion] =
    useState<SuggestedFruit | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sugerencias que la farm todavía no tiene (mismo criterio que el nombre
  // único que ya exige el server) — comparado contra el catálogo completo,
  // no solo el activo: una fruta desactivada sigue "ya existiendo" para
  // este propósito, no tendría sentido volver a sugerirla.
  const availableSuggestions = useMemo(
    () =>
      SUGGESTED_FRUITS.filter(
        (suggestion) =>
          !fruits.some(
            (fruit) =>
              fruit.name.trim().toLowerCase() ===
              suggestion.name.toLowerCase(),
          ),
      ),
    [fruits],
  );

  // FlatList con numColumns=2 + columnWrapperStyle "space-around": cuando la
  // última fila tiene un solo ítem (cantidad impar), ese ítem queda
  // centrado en su fila en vez de alineado bajo la primera columna — se ve
  // "flotando" en el medio en vez de ordenado. `null` de relleno ocupa la
  // segunda columna sin renderizar nada (ver renderItem), así la fila se
  // reparte igual que las anteriores y el último ítem real queda a la
  // izquierda.
  const gridData = useMemo<(FindFruitResponseDto | null)[]>(
    () => (fruits.length % 2 === 0 ? fruits : [...fruits, null]),
    [fruits],
  );

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

  // Tocar un chip solo abre la confirmación (ver confirmingSuggestion) — la
  // creación real pasa acá, sin abrir el diálogo completo de nombre+emoji:
  // el pedido era justamente no tener que tocar el FAB + llenar un
  // formulario para las frutas más comunes, la confirmación es el único
  // paso extra.
  async function handleConfirmAddSuggestion() {
    if (!confirmingSuggestion) {
      return;
    }
    const suggestion = confirmingSuggestion;
    setAddingSuggestion(suggestion.name);
    setError(null);
    try {
      const { fruitsControllerCreate } = getFruits();
      await fruitsControllerCreate({
        name: suggestion.name,
        icon: suggestion.icon,
      });
      setConfirmingSuggestion(null);
      await loadFruits();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAddingSuggestion(null);
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {error ? <HelperText type="error">{error}</HelperText> : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(item, index) => item?._id ?? `placeholder-${index}`}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>
              {strings.admin.fruitsCatalogLabel}
            </Text>
          }
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          // Catálogo primero, sugerencias al final — como footer del mismo
          // FlatList en vez de un ScrollView aparte debajo: dos scrolls
          // compitiendo por altura en la misma columna sin una de las dos
          // acotada es justo lo que hacía que los chips se estiraran a
          // ocupar toda la pantalla (bug real, encontrado en el celular).
          ListFooterComponent={
            availableSuggestions.length > 0 ? (
              <>
                <Divider style={styles.divider} />
                <Text style={styles.sectionLabel}>
                  {strings.admin.fruitSuggestionsLabel}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionsRow}
                >
                  {availableSuggestions.map((suggestion) => (
                    <Chip
                      key={suggestion.name}
                      onPress={() => setConfirmingSuggestion(suggestion)}
                      style={styles.suggestionChip}
                    >
                      {`${suggestion.icon} ${suggestion.name}`}
                    </Chip>
                  ))}
                </ScrollView>
              </>
            ) : null
          }
          renderItem={({ item }) => {
            if (item === null) {
              return <View style={styles.tilePlaceholder} />;
            }
            return (
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
            );
          }}
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

        <Dialog
          visible={confirmingSuggestion !== null}
          onDismiss={() => setConfirmingSuggestion(null)}
        >
          <Dialog.Title>{strings.admin.addSuggestionTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirmingSuggestion
                ? strings.admin.addSuggestionConfirm(
                    confirmingSuggestion.icon,
                    confirmingSuggestion.name,
                  )
                : ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingSuggestion(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleConfirmAddSuggestion}
              loading={addingSuggestion !== null}
            >
              {strings.common.add}
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
    sectionLabel: {
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    suggestionsRow: {
      gap: spacing.xs,
      paddingBottom: spacing.xs,
      alignItems: 'flex-start',
    },
    suggestionChip: { backgroundColor: colors.primarySoft },
    divider: { marginVertical: spacing.md },
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
    // Mismo tamaño que `tile` pero sin fondo/contenido — rellena la segunda
    // columna de una fila impar para que el último ítem real quede alineado
    // a la izquierda en vez de centrado (ver gridData más arriba).
    tilePlaceholder: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
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

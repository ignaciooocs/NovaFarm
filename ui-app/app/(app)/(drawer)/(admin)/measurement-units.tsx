import { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
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
import {
  measurementUnitsControllerCreate,
  measurementUnitsControllerFindAll,
  measurementUnitsControllerUpdate,
} from '@/api/generated/measurement-units/measurement-units';
import { KeyboardAwareDialog } from '@/components/KeyboardAwareDialog';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { parseDecimalInput, sanitizeDecimalInput } from '@/lib/format';
import { colors, spacing } from '@/theme';

type UnitMode = 'COUNT' | 'WEIGHT';

export default function MeasurementUnitsScreen() {
  const [units, setUnits] = useState<FindMeasurementUnitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando una unidad nueva; con valor = editando esa unidad (mismo
  // diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  // Cómo se anota una entrega con esta unidad. COUNT es el default porque es
  // el caso más común (envases de peso fijo) y porque no obliga a explicar
  // nada antes de empezar a escribir el nombre.
  const [mode, setMode] = useState<UnitMode>('COUNT');
  const [kgFactor, setKgFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formScrollRef = useRef<ScrollView>(null);

  async function loadUnits() {
    setLoading(true);
    try {
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
    setMode('COUNT');
    setKgFactor('');
    setDialogOpen(true);
  }

  function openEditDialog(unit: FindMeasurementUnitResponseDto) {
    setError(null);
    setEditingId(unit._id);
    setName(unit.name);
    setMode(unit.mode);
    // Una unidad WEIGHT no tiene factor; si el admin la cambia a COUNT va a
    // tener que escribir uno.
    setKgFactor(unit.kgFactor != null ? String(unit.kgFactor) : '');
    setDialogOpen(true);
  }

  // Elegir COUNT agrega el campo de kilos abajo de todo. Si el teclado ya
  // está abierto (viene de escribir el nombre) ese campo nace fuera de
  // pantalla, así que lo traemos a la vista. El setTimeout es para medir
  // después de que el campo se montó, no antes.
  function handleModeChange(next: UnitMode) {
    setMode(next);
    if (next === 'COUNT') {
      setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 0);
    }
  }

  const parsedKgFactor = parseDecimalInput(kgFactor);
  // En WEIGHT no hay factor que validar: los kilos los pone la romana en
  // cada anotación.
  const canSubmit =
    name.trim().length > 0 &&
    (mode === 'WEIGHT' || parsedKgFactor > 0) &&
    !saving;

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        mode,
        ...(mode === 'COUNT' ? { kgFactor: parsedKgFactor } : {}),
      };
      if (editingId) {
        await measurementUnitsControllerUpdate(editingId, payload);
      } else {
        await measurementUnitsControllerCreate(payload);
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
                  {item.mode === 'WEIGHT' || item.kgFactor == null
                    ? strings.admin.unitWeighed
                    : strings.admin.unitEquivalence(item.name, item.kgFactor)}
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
        {/* KeyboardAwareDialog y no Dialog pelado: este formulario tiene
            campos de texto, y en iOS el teclado tapaba el de kilos (visto en
            un iPhone 13). El porqué y los intentos que no funcionaron están
            en el componente. */}
        <KeyboardAwareDialog
          theme={{ version: 3 }}
          visible={dialogOpen}
          onDismiss={() => setDialogOpen(false)}
        >
          <Dialog.Title>
            {editingId
              ? strings.admin.editMeasurementUnit
              : strings.admin.newMeasurementUnit}
          </Dialog.Title>
          {/* ScrollArea y no Content: con el teclado abierto la ventana se
              achica (softwareKeyboardLayoutMode "resize", el default de
              Expo), y el campo de kilos —que es el último y solo existe en
              modo COUNT— quedaba tapado sin ninguna forma de llegar a él.
              Mismo recurso que el diálogo de vueltas del Anotador. */}
          <Dialog.ScrollArea>
            <ScrollView
              ref={formScrollRef}
              contentContainerStyle={styles.dialogForm}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                label={strings.admin.unitNameLabel}
                value={name}
                onChangeText={setName}
                style={styles.input}
              />

              <Text style={styles.modeLabel}>{strings.admin.unitModeLabel}</Text>
              {/* OptionSelector y no SegmentedButtons: elegir el modo se
                  entiende por el ejemplo ("trajo 2 tarros" vs. "trajo 1
                  capacho con 22,1 kg"), y esa frase no entra en media
                  pantalla de ancho — que es exactamente para lo que se creó
                  este componente. Acá además los dos ejemplos quedan a la
                  vista al mismo tiempo, así se comparan sin tocar nada. */}
              <OptionSelector
                value={mode}
                onChange={handleModeChange}
                style={styles.modeSelector}
                options={[
                  {
                    value: 'COUNT',
                    short: strings.admin.unitModeCount,
                    description: strings.admin.unitModeCountHelp,
                  },
                  {
                    value: 'WEIGHT',
                    short: strings.admin.unitModeWeight,
                    description: strings.admin.unitModeWeightHelp,
                  },
                ]}
              />

              {/* Solo en COUNT: en WEIGHT no hay factor, cada envase trae los
                  kilos que marque la romana. */}
              {mode === 'COUNT' ? (
                <TextInput
                  label={strings.admin.kgFactorLabel}
                  value={kgFactor}
                  onChangeText={(text) =>
                    setKgFactor(sanitizeDecimalInput(text))
                  }
                  keyboardType="decimal-pad"
                />
              ) : null}
              {error ? <HelperText type="error">{error}</HelperText> : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button onPress={handleSubmit} loading={saving} disabled={!canSubmit}>
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </KeyboardAwareDialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  // Sin padding horizontal: ScrollArea ya trae los mismos 24 que
  // Dialog.Content, agregarlos acá los duplicaba. El de abajo es para que el
  // último campo no quede pegado al borde cuando se scrollea hasta el final.
  dialogForm: { paddingBottom: spacing.md },
  input: { marginBottom: spacing.sm },
  modeLabel: { color: colors.textSecondary, marginBottom: spacing.xs },
  modeSelector: { marginBottom: spacing.md },
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

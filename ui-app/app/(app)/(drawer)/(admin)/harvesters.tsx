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
import { useQueryClient } from '@tanstack/react-query';
import type { FindHarvesterResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import {
  getHarvestersControllerFindAllQueryKey,
  useHarvestersControllerCreate,
  useHarvestersControllerFindAll,
  useHarvestersControllerUpdate,
} from '@/api/generated/harvesters/harvesters';
import { KeyboardAwareDialog } from '@/components/KeyboardAwareDialog';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvestEntries } from '@/db/schema';
import { syncCatalogs } from '@/lib/catalogSync';
import { getErrorMessage } from '@/lib/errors';
import { formatKg } from '@/lib/format';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { useActiveWorkdayStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

interface TodayTotal {
  unitCount: number;
  totalKg: number;
}

export default function HarvestersScreen() {
  const palette = usePalette();
  const activeWorkdayId = useActiveWorkdayStore((state) => state.workdayId);
  const queryClient = useQueryClient();

  // El catálogo del server, refrescado en cada foco. Antes cada foco prendía
  // el spinner y la lista pestañeaba al volver (mismo problema que tenía el
  // Anotador); ahora lo último se ve mientras se refresca.
  const harvestersQuery = useHarvestersControllerFindAll();
  useRefreshOnFocus([harvestersQuery.queryKey]);
  const harvesters = harvestersQuery.data ?? [];

  // Una mutación por flujo: cada una con su propio "guardando" y su propio
  // error — con una sola, tocar el ojo haría girar el Guardar del formulario.
  const createHarvester = useHarvestersControllerCreate();
  const updateHarvester = useHarvestersControllerUpdate();
  const toggleHarvester = useHarvestersControllerUpdate();

  function onCatalogChanged() {
    queryClient.invalidateQueries({
      queryKey: getHarvestersControllerFindAllQueryKey(),
    });
    // Y la caché local: "Agregar cosechador" en el Anotador lee de SQLite, y
    // sin esto un cosechador recién creado acá no aparecería ahí hasta la
    // próxima visita a Inicio. Dedupeada y nunca lanza.
    syncCatalogs();
  }
  // Cuánto lleva cada cosechador en la jornada activa DE ESTE DISPOSITIVO
  // (si hay una) — se pide siempre de SQLite local, nunca del server, mismo
  // criterio que el Anotador: es la captura de este dispositivo, no un
  // resumen de toda la farm. Vacío (sin jornada activa) o cuando el
  // cosechador todavía no tiene ninguna entrega hoy, simplemente no se
  // muestra la línea extra en su fila.
  const [todayTotalsByHarvester, setTodayTotalsByHarvester] = useState<
    Record<string, TodayTotal>
  >({});
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = creando un cosechador nuevo; con valor = editando ese cosechador
  // (mismo diálogo para ambos casos, ver openCreateDialog/openEditDialog).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');

  const saving = createHarvester.isPending || updateHarvester.isPending;
  const dialogError = createHarvester.error ?? updateHarvester.error;
  // Antes el error solo se pintaba dentro del formulario: si fallaba el ojo
  // (sin señal) o la carga de la lista, no aparecía nada en pantalla.
  const screenError = harvestersQuery.error ?? toggleHarvester.error;

  // useFocusEffect (no un simple useEffect): al volver del Anotador después
  // de anotar entregas, esta pantalla sigue montada en el drawer — hay que
  // refrescar los totales de hoy cada vez que recupera foco, no solo al
  // montarse la primera vez. (La lista del server se refresca aparte, con
  // useRefreshOnFocus.)
  useFocusEffect(
    useCallback(() => {
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

  // Solo la que falló: reset() sobre una mutación en curso la desengancha, y
  // su onSuccess (cerrar el formulario, refrescar) no correría.
  function resetDialogErrors() {
    if (createHarvester.isError) {
      createHarvester.reset();
    }
    if (updateHarvester.isError) {
      updateHarvester.reset();
    }
  }

  function openCreateDialog() {
    resetDialogErrors();
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setNickname('');
    setDialogOpen(true);
  }

  function openEditDialog(harvester: FindHarvesterResponseDto) {
    resetDialogErrors();
    setEditingId(harvester._id);
    setFirstName(harvester.firstName);
    setLastName(harvester.lastName);
    setNickname(harvester.nickname ?? '');
    setDialogOpen(true);
  }

  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  function handleSubmit() {
    const onSuccess = () => {
      setDialogOpen(false);
      onCatalogChanged();
    };
    if (editingId) {
      // null explícito (no undefined) borra un apodo existente si el
      // campo quedó vacío — ver el comentario en harvesters.service.ts.
      updateHarvester.mutate(
        {
          id: editingId,
          data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            nickname: nickname.trim() || null,
          },
        },
        { onSuccess },
      );
    } else {
      createHarvester.mutate(
        {
          data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            nickname: nickname.trim() || undefined,
          },
        },
        { onSuccess },
      );
    }
  }

  // Desactivar/reactivar es reversible y no afecta jornadas ya abiertas
  // (esas quedan referenciando el id igual, ver findActiveById en
  // server-app) — así que es un toggle directo, sin diálogo de confirmación.
  function handleToggleActive(harvester: FindHarvesterResponseDto) {
    toggleHarvester.mutate(
      { id: harvester._id, data: { active: !harvester.active } },
      { onSuccess: onCatalogChanged },
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.harvestersTitle}
      </Text>

      {screenError ? (
        <HelperText type="error">{getErrorMessage(screenError)}</HelperText>
      ) : null}

      {harvestersQuery.isPending ? (
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
                      {strings.anotador.containers(todayTotal.unitCount)} ·{' '}
                      {formatKg(todayTotal.totalKg)} {strings.anotador.kg}
                    </Text>
                  ) : null}
                </View>
                {toggleHarvester.isPending &&
                toggleHarvester.variables?.id === item._id ? (
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
        {/* KeyboardAwareDialog: son tres campos de texto y en iOS el teclado
            tapaba el último y los botones. Ver el componente. */}
        <KeyboardAwareDialog
          visible={dialogOpen}
          onDismiss={() => setDialogOpen(false)}
        >
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
            {dialogError ? (
              <HelperText type="error">{getErrorMessage(dialogError)}</HelperText>
            ) : null}
          </Dialog.Content>
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

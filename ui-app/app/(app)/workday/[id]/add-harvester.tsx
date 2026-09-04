import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import {
  ActivityIndicator,
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvesters as harvestersTable, harvesterWorkday } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { generateLocalId } from '@/lib/id';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

type LocalHarvester = typeof harvestersTable.$inferSelect;

// Buscar/listar cosechadores lee de la caché local (ver syncCatalogs, disparada
// desde Home) en vez de pedir en vivo — así funciona sin señal para cualquier
// cosechador que el catálogo ya conocía. Registrar uno *nuevo* sigue
// necesitando conexión (quickRegister): es una entrada nueva en el catálogo
// del farm, no hay un modo offline para eso todavía (ver el gap documentado
// en docs/diagrams/ui-arquitectura.md). Agregar al roster (addToRoster) es
// 100% local e instantáneo en ambos casos — es la parte que de verdad
// importa para RNF-01.
//
// Un solo campo hace de buscador Y de origen del registro nuevo (pedido del
// usuario, 2026-09-03: en terreno el anotador va preguntando nombre por
// nombre, y antes había que decidir de entrada si escribir en el buscador o
// en un formulario aparte más abajo). Esto resuelve solo, por diseño, el
// riesgo de duplicar a alguien que ya existe: si hay una coincidencia,
// aparece en la lista de abajo antes de que el anotador llegue a tocar
// "registrar nuevo" — no hace falta lógica separada de detectar duplicados.
// Si lo tipeado ya trae nombre Y apellido (separados por un espacio), tocar
// "registrar nuevo" crea directo, sin diálogo — el caso más común queda en
// un solo toque. Si es una sola palabra, pide el apellido en un diálogo
// chico antes de crear (el schema exige ambos campos). Después de agregar a
// alguien (exista o no) la pantalla NO vuelve al Anotador — limpia el campo
// y le devuelve el foco, para poder seguir preguntando nombres sin
// re-navegar cada vez; volver es la flecha del header.
export default function AddHarvesterScreen() {
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  // `any`: el tipo de ref que expone react-native-paper para TextInput es una
  // intersección incómoda de dos overloads (TextInput nativo + su propio
  // TextInputHandles no exportado) — no hay un tipo público razonable que
  // conformar acá, solo se necesita `.focus()`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchInputRef = useRef<any>(null);

  const [harvesters, setHarvesters] = useState<LocalHarvester[]>([]);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [registering, setRegistering] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [harvestersResult, rosterRows] = await Promise.all([
        db
          .select()
          .from(harvestersTable)
          .where(eq(harvestersTable.active, true)),
        db
          .select()
          .from(harvesterWorkday)
          .where(eq(harvesterWorkday.workdayId, workdayId)),
      ]);
      setHarvesters(harvestersResult);
      setExistingIds(new Set(rosterRows.map((row) => row.harvesterId)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [workdayId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return harvesters;
    }
    return harvesters.filter((harvester) =>
      `${harvester.firstName} ${harvester.lastName} ${harvester.nickname ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [harvesters, query]);

  async function addToRoster(harvesterId: string) {
    if (existingIds.has(harvesterId)) {
      return;
    }

    setAddingId(harvesterId);
    setError(null);
    try {
      const currentRows = await db
        .select({ workdayNumber: harvesterWorkday.workdayNumber })
        .from(harvesterWorkday)
        .where(eq(harvesterWorkday.workdayId, workdayId));
      const nextNumber =
        currentRows.reduce((max, row) => Math.max(max, row.workdayNumber), 0) +
        1;

      await db.insert(harvesterWorkday).values({
        id: generateLocalId(),
        workdayId,
        harvesterId,
        workdayNumber: nextNumber,
        addedAt: new Date().toISOString(),
        synced: false,
      });

      // Sin navegar de vuelta: queda lista para preguntar el próximo nombre
      // al tiro, en vez de tener que volver a entrar desde el Anotador.
      setExistingIds((prev) => new Set(prev).add(harvesterId));
      setQuery('');
      searchInputRef.current?.focus();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAddingId(null);
    }
  }

  async function quickRegister(firstName: string, lastName: string) {
    if (!firstName.trim() || !lastName.trim()) {
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      const { harvestersControllerCreate } = getHarvesters();
      const created = await harvestersControllerCreate({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      // Espeja el harvester recién creado en la caché local al tiro — sin
      // esto, no aparecería acá hasta el próximo syncCatalogs() (disparado
      // desde Home), y quedaría invisible para el resto de esta sesión.
      const row = {
        farmId: created.farmId,
        firstName: created.firstName,
        lastName: created.lastName,
        nickname: created.nickname ?? null,
        active: created.active,
      };
      await db
        .insert(harvestersTable)
        .values({ id: created._id, ...row })
        .onConflictDoUpdate({ target: harvestersTable.id, set: row });
      setHarvesters((prev) => [...prev, { id: created._id, ...row }]);

      setCreateDialogOpen(false);
      await addToRoster(created._id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  }

  // Tocar "registrar nuevo": si lo tipeado ya separa en nombre + apellido
  // (el caso más común — la gente dice su nombre completo), crea directo,
  // sin diálogo. Si es una sola palabra, no hay apellido que mandar (el
  // schema lo exige) — se pide en un diálogo chico, con el nombre ya
  // puesto.
  function handleRegisterFromQuery() {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) {
      setError(null);
      setNewFirstName(trimmed);
      setNewLastName('');
      setCreateDialogOpen(true);
      return;
    }
    const firstName = trimmed.slice(0, spaceIndex).trim();
    const lastName = trimmed.slice(spaceIndex + 1).trim();
    quickRegister(firstName, lastName);
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.anotador.addHarvester }}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextInput
          ref={searchInputRef}
          label={strings.anotador.searchHarvester}
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          autoFocus
        />

        {error ? <HelperText type="error">{error}</HelperText> : null}

        {loading ? (
          <ActivityIndicator style={styles.input} />
        ) : (
          <>
            {filtered.map((harvester) => {
              const added = existingIds.has(harvester.id);
              const row = (
                <View style={styles.row}>
                  <Text style={styles.rowText} numberOfLines={1}>
                    {harvester.nickname
                      ? `${harvester.firstName} ${harvester.lastName} ("${harvester.nickname}")`
                      : `${harvester.firstName} ${harvester.lastName}`}
                  </Text>
                  {addingId === harvester.id ? (
                    <ActivityIndicator size="small" />
                  ) : added ? (
                    <Text style={styles.addedLabel}>✓</Text>
                  ) : null}
                </View>
              );
              return added ? (
                <View key={harvester.id}>{row}</View>
              ) : (
                <TouchableRipple
                  key={harvester.id}
                  onPress={() => addToRoster(harvester.id)}
                >
                  {row}
                </TouchableRipple>
              );
            })}

            {query.trim() ? (
              <TouchableRipple onPress={handleRegisterFromQuery}>
                <Text style={styles.registerRow}>
                  {strings.anotador.registerAsNew(query.trim())}
                </Text>
              </TouchableRipple>
            ) : null}
          </>
        )}
      </ScrollView>

      <Portal>
        <Dialog
          visible={createDialogOpen}
          onDismiss={() => setCreateDialogOpen(false)}
        >
          <Dialog.Title>{strings.anotador.newHarvester}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={strings.admin.firstNameLabel}
              value={newFirstName}
              onChangeText={setNewFirstName}
              style={styles.input}
            />
            <TextInput
              label={strings.admin.lastNameLabel}
              value={newLastName}
              onChangeText={setNewLastName}
              autoFocus
            />
            {error ? <HelperText type="error">{error}</HelperText> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCreateDialogOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={() => quickRegister(newFirstName, newLastName)}
              loading={registering}
              disabled={
                !newFirstName.trim() || !newLastName.trim() || registering
              }
            >
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: registerRow usa el
// primary del tema activo (usePalette), así que los estilos deben
// recalcularse cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    input: { marginBottom: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowText: { flex: 1, marginRight: spacing.sm },
    addedLabel: { color: colors.primary, fontWeight: '700' },
    registerRow: {
      color: colors.primary,
      fontWeight: '700',
      paddingVertical: spacing.md,
    },
  });
}

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import {
  ActivityIndicator,
  Button,
  Divider,
  HelperText,
  List,
  Text,
  TextInput,
} from 'react-native-paper';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { harvesters as harvestersTable, harvesterWorkday } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { generateLocalId } from '@/lib/id';
import { spacing } from '@/theme';

type LocalHarvester = typeof harvestersTable.$inferSelect;

// Buscar/listar cosechadores lee de la caché local (ver syncCatalogs, disparada
// desde Home) en vez de pedir en vivo — así funciona sin señal para cualquier
// cosechador que el catálogo ya conocía. Registrar uno *nuevo* sigue
// necesitando conexión (handleQuickRegister): es una entrada nueva en el
// catálogo del farm, no hay un modo offline para eso todavía (ver el gap
// documentado en docs/diagrams/ui-arquitectura.md). Agregar al roster
// (addToRoster) es 100% local e instantáneo en ambos casos — es la parte que
// de verdad importa para RNF-01.
export default function AddHarvesterScreen() {
  const router = useRouter();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();

  const [harvesters, setHarvesters] = useState<LocalHarvester[]>([]);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.back();
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

      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
      setAddingId(null);
    }
  }

  async function handleQuickRegister() {
    if (!newFirstName.trim() || !newLastName.trim()) {
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      const { harvestersControllerCreate } = getHarvesters();
      const created = await harvestersControllerCreate({
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
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

      await addToRoster(created._id);
    } catch (err) {
      setError(getErrorMessage(err));
      setRegistering(false);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text variant="headlineMedium" style={styles.title}>
          {strings.anotador.addHarvester}
        </Text>

        <TextInput
          label={strings.anotador.searchHarvester}
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />

        {loading ? (
          <ActivityIndicator style={styles.input} />
        ) : (
          filtered.map((harvester) => (
            <List.Item
              key={harvester.id}
              title={
                harvester.nickname
                  ? `${harvester.firstName} ${harvester.lastName} ("${harvester.nickname}")`
                  : `${harvester.firstName} ${harvester.lastName}`
              }
              onPress={() => addToRoster(harvester.id)}
              right={() => {
                if (existingIds.has(harvester.id)) {
                  return <List.Icon icon="check" />;
                }
                if (addingId === harvester.id) {
                  return <ActivityIndicator size="small" />;
                }
                return null;
              }}
            />
          ))
        )}

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.subtitle}>
          {strings.anotador.newHarvester}
        </Text>
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
          style={styles.input}
        />

        {error ? <HelperText type="error">{error}</HelperText> : null}

        <Button
          mode="contained"
          onPress={handleQuickRegister}
          loading={registering}
          disabled={
            !newFirstName.trim() || !newLastName.trim() || registering
          }
        >
          {strings.anotador.newHarvester}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.sm },
  input: { marginBottom: spacing.sm },
  divider: { marginVertical: spacing.md },
});

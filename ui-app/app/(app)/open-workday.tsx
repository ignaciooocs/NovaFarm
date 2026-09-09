import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { and, eq } from 'drizzle-orm';
import { OptionSelector } from '@/components/OptionSelector';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import {
  products as productsTable,
  measurementUnits as measurementUnitsTable,
  workdays,
} from '@/db/schema';
import { syncCatalogs } from '@/lib/catalogSync';
import { generateLocalId } from '@/lib/id';
import { getErrorMessage } from '@/lib/errors';
import { getActiveWorkdayWithRecovery } from '@/lib/recoverActiveWorkday';
import { pushPendingWorkdays } from '@/lib/workdaySync';
import {
  useActiveWorkdayStore,
  useAuthStore,
  useConnectivityStore,
  usePalette,
} from '@/stores';
import { colors, spacing } from '@/theme';

type LocalProduct = typeof productsTable.$inferSelect;
type LocalUnit = typeof measurementUnitsTable.$inferSelect;

export default function OpenWorkdayScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const uid = useAuthStore((state) => state.user?.uid);
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );

  // Generado una sola vez por visita a esta pantalla (no en cada submit) y
  // reusado en cada reintento — si el primer POST se cae después de que el
  // server ya creó la jornada pero antes de que la respuesta llegue, un
  // segundo tap con el mismo clientEntryId es idempotente en vez de abrir
  // una jornada duplicada (ver el gap de idempotencia documentado en
  // docs/diagrams/ui-arquitectura.md). También es el id de la fila local.
  const [clientEntryId] = useState(() => generateLocalId());

  // true hasta confirmar que no hay otra jornada ya abierta — se asume un
  // dispositivo trabajando una jornada a la vez (modelo-datos.md); si ya
  // hay una, se redirige a esa en vez de dejar abrir una segunda.
  const [checkingActive, setCheckingActive] = useState(true);

  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [units, setUnits] = useState<LocalUnit[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const isConnected = useConnectivityStore((state) => state.isConnected);

  const [productId, setProductId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    async function checkActive() {
      const activeWorkday = await getActiveWorkdayWithRecovery(uid!);
      if (activeWorkday) {
        router.replace({
          pathname: '/workday/[id]/anotador',
          params: { id: activeWorkday.id },
        });
        return;
      }
      setCheckingActive(false);
    }

    checkActive();
  }, [router, uid]);

  useEffect(() => {
    if (checkingActive) {
      return;
    }

    // Lee la caché local, no la API: abrir jornada tiene que funcionar sin
    // señal (era el otro bloqueo online de esta pantalla, además del POST).
    // syncCatalogs() se dispara igual, sin await y sin bloquear — si hay
    // conexión refresca la caché para la próxima vez, y viene dedupeado por
    // su propio guard, así que no cuesta nada llamarlo de más.
    async function loadCatalogs() {
      setLoadingCatalogs(true);
      try {
        syncCatalogs();
        const farmId = useAuthStore.getState().claims.farmId ?? '';
        const [productsResult, unitsResult] = await Promise.all([
          db
            .select()
            .from(productsTable)
            .where(
              and(
                eq(productsTable.active, true),
                eq(productsTable.farmId, farmId),
              ),
            ),
          db
            .select()
            .from(measurementUnitsTable)
            .where(
              and(
                eq(measurementUnitsTable.active, true),
                eq(measurementUnitsTable.farmId, farmId),
              ),
            ),
        ]);
        setProducts(productsResult);
        setUnits(unitsResult);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingCatalogs(false);
      }
    }

    loadCatalogs();
  }, [checkingActive]);

  const canSubmit = Boolean(productId) && Boolean(unitId) && !saving;

  const todayLabel = useMemo(() => {
    const label = new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  async function handleSubmit() {
    if (!productId || !unitId || !uid) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // Local primero y sin red, igual que el resto de la captura (RNF-01):
      // llegar al campo sin señal no puede impedir empezar el día. La fila
      // nace `synced: false` / `serverId: null` y la sube
      // pushPendingWorkdays() — desde el sync manual, o desde el
      // fire-and-forget de acá abajo. El id local es el mismo clientEntryId
      // que se manda después, así que si esta pantalla se remonta el insert
      // es un no-op sobre la misma fila en vez de una jornada duplicada.
      const now = new Date().toISOString();
      await db
        .insert(workdays)
        .values({
          id: clientEntryId,
          serverId: null,
          farmId: useAuthStore.getState().claims.farmId ?? '',
          date: now,
          productId,
          defaultMeasurementUnitId: unitId,
          status: 'OPEN',
          finalTotalKg: null,
          synced: false,
          createdAt: now,
          createdByUid: uid,
        })
        .onConflictDoNothing();

      setActiveWorkdayId(clientEntryId);
      router.replace({
        pathname: '/workday/[id]/anotador',
        params: { id: clientEntryId },
      });

      // Fire-and-forget: con señal la jornada queda en el server al toque,
      // así sus compañeros la ven en "Equipo activo ahora" (Home) sin
      // esperar a que sincronice. Sin señal falla en silencio y queda
      // pendiente — no se muestra error porque abrir jornada ya no depende
      // de esto. Acá no hay riesgo de reescribir ids como en cosechadores:
      // solo escribe serverId/synced sobre esta misma fila, y nada del
      // camino de captura lee esos dos campos.
      pushPendingWorkdays();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (checkingActive || loadingCatalogs) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (products.length === 0 || units.length === 0) {
    const missingProducts = products.length === 0;
    // Sin conexión, un catálogo vacío casi nunca significa "no hay frutas
    // creadas" — significa que la caché local todavía no se sincronizó
    // (syncCatalogs corre desde Home y al reconectar). Mandar a crear una
    // fruta ahí sería mal consejo, y además crear catálogo sí necesita red.
    const offlineCache = !isConnected;
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.workday.openTitle }}
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>
            {offlineCache ? '📡' : missingProducts ? '🍇' : '📦'}
          </Text>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {offlineCache
              ? strings.workday.catalogUnavailableTitle
              : missingProducts
                ? strings.admin.productsTitle
                : strings.admin.measurementUnitsTitle}
          </Text>
          <Text style={styles.emptyHelper}>
            {offlineCache
              ? strings.workday.catalogUnavailableHelp
              : strings.admin.emptyList}
          </Text>
          {offlineCache ? null : (
            <Button
              mode="contained"
              onPress={() =>
                router.push(missingProducts ? '/products' : '/measurement-units')
              }
              buttonColor={palette.primary}
              contentStyle={styles.buttonContent}
              style={styles.button}
            >
              {missingProducts
                ? strings.admin.newProduct
                : strings.admin.newMeasurementUnit}
            </Button>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.workday.openTitle }}
      />

      <Text style={styles.dateLabel}>{todayLabel}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="labelLarge" style={styles.sectionLabel}>
          {strings.workday.product}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productRow}
        >
          {products.map((product) => {
            const selected = product.id === productId;
            return (
              <TouchableRipple
                key={product.id}
                onPress={() => setProductId(product.id)}
                style={[styles.productTile, selected && styles.productTileSelected]}
              >
                <View style={styles.productTileBody}>
                  <Text style={styles.productEmoji}>
                    {product.icon ?? DEFAULT_PRODUCT_ICON}
                  </Text>
                  <Text
                    style={[
                      styles.productName,
                      selected && styles.productNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {product.name}
                  </Text>
                </View>
              </TouchableRipple>
            );
          })}
        </ScrollView>

        <Text variant="labelLarge" style={styles.sectionLabel}>
          {strings.workday.measurementUnit}
        </Text>
        <OptionSelector
          value={unitId}
          onChange={setUnitId}
          style={styles.unitSelector}
          options={units.map((unit) => ({
            value: unit.id,
            short: unit.name,
            description:
              unit.mode === 'WEIGHT' || unit.kgFactor == null
                ? strings.admin.unitWeighed
                : strings.admin.unitEquivalence(unit.name, unit.kgFactor),
          }))}
        />
      </ScrollView>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={saving}
        disabled={!canSubmit}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.workday.open}
      </Button>
    </Screen>
  );
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    dateLabel: {
      color: colors.textSecondary,
      fontSize: 16,
      textTransform: 'capitalize',
      marginBottom: spacing.md,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.md },
    sectionLabel: { marginBottom: spacing.sm, color: colors.textSecondary },
    // Fila horizontal deslizable en vez de una grilla que envuelve — con
    // varias frutas ocupaba demasiado alto de la pantalla antes de llegar
    // siquiera a la unidad de medida (pedido del usuario, 2026-09-03).
    productRow: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
      marginBottom: spacing.lg,
      alignItems: 'flex-start',
    },
    productTile: {
      width: 84,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    productTileSelected: {
      backgroundColor: palette.primarySoft,
      borderColor: palette.primary,
    },
    productTileBody: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    productEmoji: { fontSize: 28, marginBottom: 2 },
    productName: { fontWeight: 'bold', fontSize: 12, textAlign: 'center' },
    productNameSelected: { color: palette.primary },
    unitSelector: { marginBottom: spacing.md },
    buttonContent: { paddingVertical: spacing.xs },
    button: { marginTop: spacing.sm, borderRadius: 12 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: { marginBottom: spacing.xs },
    emptyHelper: {
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
  });
}

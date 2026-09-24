import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
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
import { formatCLP, sanitizeIntegerInput } from '@/lib/format';
import { generateLocalId } from '@/lib/id';
import { convertRate, type PayBasis } from '@/lib/pay';
import { getActiveWorkdayWithRecovery } from '@/lib/recoverActiveWorkday';
import { daysSinceLocalDay, isFromPreviousDay } from '@/lib/workdayDate';
import { pushPendingWorkdays } from '@/lib/workdaySync';
import {
  useActiveWorkdayStore,
  showErrorToast,
  useAuthStore,
  useConnectivityStore,
  usePalette,
} from '@/stores';
import { colors, spacing } from '@/theme';

type LocalProduct = typeof productsTable.$inferSelect;
type LocalUnit = typeof measurementUnitsTable.$inferSelect;
type LocalWorkday = typeof workdays.$inferSelect;

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
  // La jornada abierta, cuando quedó de un día anterior: ese caso no
  // redirige, muestra un aviso (ver checkActive más abajo).
  const [staleWorkday, setStaleWorkday] = useState<LocalWorkday | null>(null);

  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [units, setUnits] = useState<LocalUnit[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const isConnected = useConnectivityStore((state) => state.isConnected);

  const [productId, setProductId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

  // Tarifa del día. Opcional: se puede abrir la jornada sin definirla (hay
  // farms que pagan por día, y muchas veces el precio todavía no está
  // cerrado a la hora de partir). `payTouched` existe solo para que la
  // precarga no le pise encima lo que la persona ya tipeó.
  const [payBasis, setPayBasis] = useState<PayBasis>('PER_UNIT');
  const [payAmount, setPayAmount] = useState('');
  const [payTouched, setPayTouched] = useState(false);
  const [payPrefilled, setPayPrefilled] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) {
      return;
    }

    async function checkActive() {
      const activeWorkday = await getActiveWorkdayWithRecovery(uid!);
      if (activeWorkday) {
        // Una jornada abierta *de hoy* es el caso normal: se tocó "Abrir
        // Jornada" teniendo una en curso, y lo que la persona quiere es
        // volver a anotar. Sigue derecho al Anotador, sin friccion extra.
        if (!isFromPreviousDay(activeWorkday.date)) {
          router.replace({
            pathname: '/workday/[id]/anotador',
            params: { id: activeWorkday.id },
          });
          return;
        }
        // De un día anterior: se le avisa en vez de redirigirlo en silencio
        // (ver strings.workday.unclosed). Sigue sin poder abrir una segunda
        // jornada — eso no cambió — pero ahora sabe por qué y qué hacer.
        setStaleWorkday(activeWorkday);
      }
      setCheckingActive(false);
    }

    checkActive();
  }, [router, uid]);

  useEffect(() => {
    // staleWorkday corta acá también: con una jornada de otro día sin
    // cerrar no se va a mostrar el formulario, así que no hay catálogo que
    // cargar.
    if (checkingActive || staleWorkday) {
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
        showErrorToast(err);
      } finally {
        setLoadingCatalogs(false);
      }
    }

    loadCatalogs();
  }, [checkingActive, staleWorkday]);

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === unitId) ?? null,
    [units, unitId],
  );

  // Propone la tarifa de la última jornada de este mismo cultivo con este
  // mismo envase. Local, sin red — y a propósito solo con esa combinación
  // exacta: heredar el precio del mismo tarro pero de otra fruta sería peor
  // que no proponer nada, porque el número aparece puesto y nadie lo revisa.
  useEffect(() => {
    if (!productId || !unitId || payTouched) {
      return;
    }

    let cancelled = false;
    (async () => {
      const farmId = useAuthStore.getState().claims.farmId ?? '';
      const [last] = await db
        .select()
        .from(workdays)
        .where(
          and(
            eq(workdays.farmId, farmId),
            eq(workdays.productId, productId),
            eq(workdays.defaultMeasurementUnitId, unitId),
            isNotNull(workdays.payRate),
          ),
        )
        .orderBy(desc(workdays.createdAt))
        .limit(1);

      if (cancelled) {
        return;
      }

      if (last?.payRate != null) {
        setPayAmount(String(last.payRate));
        setPayBasis(last.payBasis ?? 'PER_KG');
        setPayPrefilled(true);
      } else {
        setPayAmount('');
        setPayPrefilled(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, unitId, payTouched]);

  // Un envase que se pesa en cada vuelta solo se puede pagar por kilo (el
  // server rechaza lo otro). Se corrige acá y no al enviar para que el
  // formulario nunca muestre una opción que después va a ser rechazada.
  useEffect(() => {
    if (selectedUnit?.mode === 'WEIGHT' && payBasis !== 'PER_KG') {
      setPayBasis('PER_KG');
    }
  }, [selectedUnit, payBasis]);

  const payRate = payAmount ? Number(payAmount) : null;
  const rateLabel = buildRateLabel(payRate, payBasis, selectedUnit);

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
          // Los dos juntos o los dos en null — sin monto, la base no dice
          // nada. Si quedó sin tarifa, se puede definir después desde
          // Cerrar Jornada mientras la jornada siga abierta.
          payRate,
          payBasis: payRate == null ? null : payBasis,
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
      showErrorToast(err);
    } finally {
      setSaving(false);
    }
  }

  // Antes del spinner de catálogos a propósito: en cuanto se sabe que hay
  // una jornada de otro día, no hay nada que esperar — este aviso no usa el
  // catálogo, y hacerlo esperar solo retrasaría la única cosa que la persona
  // tiene que leer acá.
  if (staleWorkday) {
    const daysAgo = daysSinceLocalDay(staleWorkday.date);
    const dateLabel = new Date(staleWorkday.date).toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.workday.openTitle }}
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {strings.workday.unclosed.title}
          </Text>
          <Text style={styles.emptyHelper}>
            {daysAgo === 1
              ? strings.workday.unclosed.openedYesterday
              : strings.workday.unclosed.openedOn(dateLabel)}{' '}
            {strings.workday.unclosed.help}
          </Text>
          <Button
            mode="contained"
            onPress={() =>
              router.replace({
                pathname: '/workday/[id]/close',
                params: { id: staleWorkday.id },
              })
            }
            buttonColor={palette.primary}
            contentStyle={styles.buttonContent}
            style={styles.button}
          >
            {strings.workday.unclosed.goClose}
          </Button>
          {/* Secundario y no un segundo botón contained: cerrar es lo que
              desbloquea abrir una nueva, pero volver al Anotador sigue
              siendo legítimo (corregir una entrega antes de cerrar, o un
              turno que de verdad cruzó la medianoche). */}
          <Button
            mode="text"
            onPress={() =>
              router.replace({
                pathname: '/workday/[id]/anotador',
                params: { id: staleWorkday.id },
              })
            }
            textColor={palette.primary}
          >
            {strings.workday.unclosed.goRecord}
          </Button>
        </View>
      </Screen>
    );
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
        keyboardShouldPersistTaps="handled"
        // iOS no achica la ventana al abrir el teclado (Android sí, solo),
        // así que sin esto el campo de la tarifa —el último de la pantalla—
        // queda tapado mientras se escribe.
        automaticallyAdjustKeyboardInsets
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

        {selectedUnit ? (
          <>
            <Text variant="labelLarge" style={styles.sectionLabel}>
              {strings.pay.section}
            </Text>
            {selectedUnit.mode === 'COUNT' ? (
              <>
                <Text style={styles.payNote}>{strings.pay.basisLabel}</Text>
                <OptionSelector<PayBasis>
                  value={payBasis}
                  onChange={(value) => {
                    setPayBasis(value);
                    setPayTouched(true);
                  }}
                  style={styles.unitSelector}
                  options={[
                    {
                      value: 'PER_UNIT',
                      short: strings.pay.perUnitShort(selectedUnit.name),
                      description: strings.pay.perUnitHelp(selectedUnit.name),
                    },
                    {
                      value: 'PER_KG',
                      short: strings.pay.perKgShort,
                      description: strings.pay.perKgHelp(
                        strings.admin.unitEquivalence(
                          selectedUnit.name,
                          selectedUnit.kgFactor ?? 0,
                        ),
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Text style={styles.payNote}>
                {strings.pay.weighedFixedNote}
              </Text>
            )}

            <TextInput
              mode="outlined"
              label={strings.pay.amountLabel}
              value={payAmount}
              onChangeText={(text) => {
                setPayAmount(sanitizeIntegerInput(text));
                setPayTouched(true);
              }}
              keyboardType="number-pad"
              left={<TextInput.Affix text="$" />}
              outlineColor={colors.border}
              activeOutlineColor={palette.primary}
            />
            <HelperText type="info" visible>
              {rateLabel ?? strings.pay.optionalHelp}
            </HelperText>
            {payPrefilled && !payTouched && payAmount ? (
              <Text style={styles.payNote}>{strings.pay.prefilledFrom}</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

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

// La tarifa escrita en las dos unidades. Con un envase de peso fijo las dos
// opciones de pago dan la misma plata, así que mostrar la conversión es lo
// que deja ver que son el mismo precio y no dos tratos distintos.
function buildRateLabel(
  payRate: number | null,
  payBasis: PayBasis,
  unit: LocalUnit | null,
): string | null {
  if (payRate == null || !unit) {
    return null;
  }

  // Envase que se pesa en cada vuelta: no hay factor con qué convertir, y
  // el pago por kilo es el único posible.
  if (unit.mode !== 'COUNT' || unit.kgFactor == null) {
    return strings.pay.ratePerKg(formatCLP(payRate));
  }

  const { converted, exact } = convertRate(payRate, unit.kgFactor, payBasis);

  return payBasis === 'PER_UNIT'
    ? strings.pay.ratePerUnitWithKg(
        formatCLP(payRate),
        formatCLP(converted),
        unit.name,
        exact,
      )
    : strings.pay.ratePerKgWithUnit(
        formatCLP(payRate),
        formatCLP(converted),
        unit.name,
        exact,
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
    payNote: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: spacing.md,
    },
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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Animated,
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { eq } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  Portal,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { HoldToRecordButton } from '@/components/HoldToRecordButton';
import { KeyboardAwareDialog } from '@/components/KeyboardAwareDialog';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import {
  harvesters as harvestersTable,
  harvestEntries,
  harvesterWorkday,
  measurementUnits,
  workdays,
} from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import {
  formatKg,
  parseDecimalInput,
  roundToOneDecimal,
  sanitizeDecimalInput,
} from '@/lib/format';
import { generateLocalId } from '@/lib/id';
import { isFromPreviousDay } from '@/lib/workdayDate';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

type LocalHarvester = typeof harvestersTable.$inferSelect;

interface RosterRow {
  id: string;
  harvesterId: string;
  workdayNumber: number;
}

interface EntryTotal {
  unitCount: number;
  totalKg: number;
}

interface RoundEntry {
  id: string;
  unitCount: number;
  totalKg: number;
  measuredKg: number | null;
  recordedAt: string;
}

// Una anotación recién hecha, lo que necesita Deshacer.
interface RecordedEntry {
  harvesterId: string;
  entry: RoundEntry;
  // Resuelve true cuando la escritura en SQLite terminó bien, false si falló
  // (y en ese caso la pantalla ya se revirtió sola).
  saved: Promise<boolean>;
}

interface Toast {
  // Distinto en cada aviso: el Snackbar se remonta con esta key. Montado el
  // mismo, un aviso nuevo heredaba el tiempo que le quedaba al anterior
  // (Paper solo arranca el temporizador al pasar a visible).
  id: string;
  message: string;
  duration: number;
  recorded?: RecordedEntry;
}

const RECORDED_TOAST_MS = 4000;
const HINT_TOAST_MS = 2500;

// Roster + registro real (RF-02): tocar +1/+2/+5/-1 escribe local al tiro
// (RNF-01, sin esperar la base ni la red — el estado se actualiza primero,
// la escritura a SQLite corre atrás). Si la unidad por defecto de la jornada
// es de modo WEIGHT (RF-03.2, un capacho que se pesa en cada vuelta), en vez
// de los botones se pide el peso por diálogo. El botón (!) por cosechador
// abre el detalle de cada vuelta anotada (entriesByHarvester ya trae todo
// lo necesario desde load(), sin pedir de nuevo a la base al tocarlo).
export default function AnotadorScreen() {
  const router = useRouter();
  const { id: workdayId } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [harvestersById, setHarvestersById] = useState<
    Record<string, LocalHarvester>
  >({});
  const [totalsByHarvester, setTotalsByHarvester] = useState<
    Record<string, EntryTotal>
  >({});
  const [entriesByHarvester, setEntriesByHarvester] = useState<
    Record<string, RoundEntry[]>
  >({});
  const [defaultUnit, setDefaultUnit] = useState<{
    id: string;
    name: string;
    mode: 'COUNT' | 'WEIGHT';
    kgFactor: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weightDialogHarvesterId, setWeightDialogHarvesterId] = useState<
    string | null
  >(null);
  const [weightInput, setWeightInput] = useState('');
  // Sumar/descontar en modo pesaje directo (pedido del usuario, 2026-09-03):
  // en modo contenedores el -1 ya cubre la corrección; acá no había forma
  // de descontar kg específicos si un supervisor lo pedía. El teclado
  // numérico (decimal-pad) normalmente no tiene tecla de signo menos, así
  // que el toggle decide el signo — lo que se tipea siempre es una
  // magnitud positiva.
  const [weightMode, setWeightMode] = useState<'add' | 'discount'>('add');
  const [infoHarvesterId, setInfoHarvesterId] = useState<string | null>(null);

  // Pesaje de control (ver lib/weighing.ts): el peso real de una vuelta
  // hecha con un envase de peso fijo. Es opcional y no toca ni el total ni
  // el pago — se anota desde el diálogo de vueltas, nunca desde el camino
  // rápido de anotar.
  const [measuring, setMeasuring] = useState<{
    harvesterId: string;
    round: RoundEntry & { roundNumber: number };
  } | null>(null);
  const [measureInput, setMeasureInput] = useState('');
  const [savingMeasure, setSavingMeasure] = useState(false);
  // Solo para el aviso de "esta jornada es de otro día" — el resto de la
  // pantalla no necesita la fecha, por eso no estaba guardada.
  const [workdayDate, setWorkdayDate] = useState<string | null>(null);

  // El aviso de abajo: la confirmación de cada anotación (con Deshacer) o
  // el "mantén apretado" de un toque rápido. `toast` sigue guardado después
  // de ocultarse para que el Snackbar se desvanezca con su texto.
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  // El aviso vigente también en una ref: el catch de una escritura corre más
  // tarde y tiene que ver el aviso de ese momento, no el de su render.
  const toastRef = useRef<Toast | null>(null);

  function showToast(next: Toast) {
    toastRef.current = next;
    setToast(next);
    setToastVisible(true);
  }

  // Sin setLoading(true) acá, a propósito: `loading` nace en true y solo
  // cubre la primera carga. Esta función corre también cada vez que la
  // pantalla recupera el foco (al volver de agregar cosechador, sincronizar o
  // cerrar), y si volviera a prender el spinner reemplazaría la pantalla
  // entera por un instante — el pestañeo que reportó el usuario. Es la
  // pantalla más usada del día y entre recarga y recarga no hay nada que
  // esperar: SQLite responde en milisegundos y los datos anteriores siguen
  // siendo válidos hasta que llegan los nuevos.
  const load = useCallback(async () => {
    try {
      const [workdayRow] = await db
        .select()
        .from(workdays)
        .where(eq(workdays.id, workdayId));
      if (!workdayRow) {
        setError(strings.errors.generic);
        return;
      }
      setWorkdayDate(workdayRow.date);

      const [units, harvestersResult, rosterRows, entryRows] =
        await Promise.all([
          db.select().from(measurementUnits),
          db.select().from(harvestersTable),
          db
            .select()
            .from(harvesterWorkday)
            .where(eq(harvesterWorkday.workdayId, workdayId)),
          db
            .select()
            .from(harvestEntries)
            .where(eq(harvestEntries.workdayId, workdayId)),
        ]);

      // Orden cronológico explícito en JS (no confiar en el orden de
      // llegada de la consulta) — recordedAt es ISO 8601, así que comparar
      // como string ya da el orden temporal correcto.
      entryRows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

      const unit = units.find(
        (candidate) => candidate.id === workdayRow.defaultMeasurementUnitId,
      );
      setDefaultUnit(
        unit
          ? {
              id: unit.id,
              name: unit.name,
              mode: unit.mode,
              kgFactor: unit.kgFactor,
            }
          : null,
      );

      const byId: Record<string, LocalHarvester> = {};
      harvestersResult.forEach((harvester) => {
        byId[harvester.id] = harvester;
      });
      setHarvestersById(byId);

      // Un solo recorrido de las entregas arma tanto los totales (antes se
      // pedían aparte con un sum()+groupBy en SQL) como el detalle por
      // vuelta que necesita el diálogo de información — así (!) abre al
      // tiro, sin otra consulta a la base en ese momento.
      const totals: Record<string, EntryTotal> = {};
      const entries: Record<string, RoundEntry[]> = {};
      entryRows.forEach((row) => {
        const current = totals[row.harvesterId] ?? {
          unitCount: 0,
          totalKg: 0,
        };
        totals[row.harvesterId] = {
          unitCount: current.unitCount + row.unitCount,
          totalKg: current.totalKg + row.totalKg,
        };
        const list = entries[row.harvesterId] ?? [];
        list.push({
          id: row.id,
          unitCount: row.unitCount,
          totalKg: row.totalKg,
          measuredKg: row.measuredKg,
          recordedAt: row.recordedAt,
        });
        entries[row.harvesterId] = list;
      });
      setTotalsByHarvester(totals);
      setEntriesByHarvester(entries);

      setRoster(
        rosterRows
          .map((row) => ({
            id: row.id,
            harvesterId: row.harvesterId,
            workdayNumber: row.workdayNumber,
          }))
          .sort((a, b) => a.workdayNumber - b.workdayNumber),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [workdayId]);

  // useFocusEffect: al volver de add-harvester esta pantalla sigue montada
  // en el stack, hay que refrescar al recuperar foco, no solo al montar.
  //
  // Al perder el foco se oculta el aviso: Deshacer borra la anotación de
  // SQLite, y eso solo es seguro mientras no se haya sincronizado — que
  // pasa en otra pantalla. Así nunca se puede deshacer una ya subida.
  useFocusEffect(
    useCallback(() => {
      load();
      return () => setToastVisible(false);
    }, [load]),
  );

  // `unitCount` son envases y solo envases (±1, +2, +5), nunca kilos: en
  // modo WEIGHT siempre es ±1 y los kilos van aparte en `weightKg`, que es
  // lo que marcó la romana para ese envase. Antes de que la unidad
  // declarara su modo, una anotación de pesaje metía los kilos acá y la
  // pantalla terminaba diciendo "22,1 envases".
  function recordDelivery(
    harvesterId: string,
    unitCount: number,
    weightKg?: number,
  ) {
    if (!defaultUnit) {
      return;
    }
    const kgPerContainer =
      defaultUnit.mode === 'WEIGHT' ? weightKg : defaultUnit.kgFactor;
    if (kgPerContainer === undefined || kgPerContainer === null) {
      return;
    }
    const entry: RoundEntry = {
      id: generateLocalId(),
      unitCount,
      totalKg: roundToOneDecimal(unitCount * kgPerContainer),
      measuredKg: null,
      recordedAt: new Date().toISOString(),
    };

    // Actualiza la UI al tiro (RNF-01) — la escritura a SQLite sigue en
    // paralelo, sin bloquear el próximo toque.
    addEntryToState(harvesterId, entry);

    const saved = db
      .insert(harvestEntries)
      .values({
        id: entry.id,
        workdayId,
        harvesterId,
        measurementUnitId: defaultUnit.id,
        unitCount,
        totalKg: entry.totalKg,
        recordedAt: entry.recordedAt,
        synced: false,
      })
      .then(
        () => true,
        (err) => {
          // Rara vez falla una escritura local, pero si pasa hay que revertir
          // lo optimista — no dejar la UI mostrando algo que no quedó
          // guardado, ni un "Anotado" encima.
          removeEntryFromState(harvesterId, entry);
          if (toastRef.current?.recorded?.entry.id === entry.id) {
            setToastVisible(false);
          }
          setError(getErrorMessage(err));
          return false;
        },
      );

    // La confirmación de que sí anotó (docs/issues.md): vibración distinta
    // para sumar y descontar, el total del cosechador da un salto (ver
    // BounceOnChange) y el aviso de abajo dice qué y a quién, con Deshacer.
    void Haptics.notificationAsync(
      unitCount > 0
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );

    const harvester = harvestersById[harvesterId];
    const name = harvester
      ? `${harvester.firstName} ${harvester.lastName}`
      : '...';
    const amount =
      defaultUnit.mode === 'WEIGHT'
        ? `${formatKg(Math.abs(entry.totalKg))} ${strings.anotador.kg}`
        : strings.anotador.containers(Math.abs(unitCount));
    showToast({
      id: entry.id,
      message:
        unitCount > 0
          ? strings.anotador.recorded(amount, name)
          : strings.anotador.discounted(amount, name),
      duration: RECORDED_TOAST_MS,
      recorded: { harvesterId, entry, saved },
    });
  }

  function showHoldHint() {
    showToast({
      id: `hint-${Date.now()}`,
      message: strings.anotador.holdToRecordHint,
      duration: HINT_TOAST_MS,
    });
  }

  function undoRecord({ harvesterId, entry, saved }: RecordedEntry) {
    setToastVisible(false);
    // Espera a que termine la escritura: si el borrado corriera antes que el
    // insert, no borraría nada y la anotación quedaría guardada aunque la
    // pantalla ya no la mostrara. Son milisegundos.
    saved.then(async (ok) => {
      if (!ok) {
        return;
      }
      removeEntryFromState(harvesterId, entry);
      try {
        await db.delete(harvestEntries).where(eq(harvestEntries.id, entry.id));
      } catch (err) {
        setError(getErrorMessage(err));
        // La pantalla ya la sacó y la base la conserva: se relee la base,
        // que es la verdad, en vez de adivinar.
        load();
      }
    });
  }

  // Suma una vuelta al total y a la lista del cosechador, para que el
  // diálogo (!) quede al día sin tener que recargar.
  function addEntryToState(harvesterId: string, entry: RoundEntry) {
    setTotalsByHarvester((prev) => {
      const current = prev[harvesterId] ?? { unitCount: 0, totalKg: 0 };
      return {
        ...prev,
        [harvesterId]: {
          unitCount: current.unitCount + entry.unitCount,
          totalKg: current.totalKg + entry.totalKg,
        },
      };
    });
    setEntriesByHarvester((prev) => ({
      ...prev,
      [harvesterId]: [...(prev[harvesterId] ?? []), entry],
    }));
  }

  function removeEntryFromState(harvesterId: string, entry: RoundEntry) {
    setTotalsByHarvester((prev) => {
      const current = prev[harvesterId] ?? { unitCount: 0, totalKg: 0 };
      return {
        ...prev,
        [harvesterId]: {
          unitCount: current.unitCount - entry.unitCount,
          totalKg: current.totalKg - entry.totalKg,
        },
      };
    });
    setEntriesByHarvester((prev) => ({
      ...prev,
      [harvesterId]: (prev[harvesterId] ?? []).filter(
        (candidate) => candidate.id !== entry.id,
      ),
    }));
  }

  function openWeightDialog(harvesterId: string) {
    setWeightInput('');
    setWeightMode('add');
    setWeightDialogHarvesterId(harvesterId);
  }

  function submitWeight() {
    const magnitude = parseDecimalInput(weightInput);
    if (!weightDialogHarvesterId || !magnitude || magnitude <= 0) {
      return;
    }
    // La entrega es UN envase (el capacho que se acaba de pesar); el toggle
    // solo decide el signo, que es el mismo mecanismo del -1 de modo
    // contenedores (RF-02.3). El peso tipeado siempre es una magnitud
    // positiva — el decimal-pad no trae tecla de menos.
    const containers = weightMode === 'discount' ? -1 : 1;
    recordDelivery(weightDialogHarvesterId, containers, magnitude);
    setWeightDialogHarvesterId(null);
  }

  const grandTotalKg = Object.values(totalsByHarvester).reduce(
    (sum, entry) => sum + entry.totalKg,
    0,
  );
  const isDirectWeighing = defaultUnit?.mode === 'WEIGHT';
  function openMeasureDialog(
    harvesterId: string,
    round: RoundEntry & { roundNumber: number },
  ) {
    setMeasuring({ harvesterId, round });
    // La coma es lo que muestra formatKg y lo que el campo acepta de vuelta.
    setMeasureInput(
      round.measuredKg != null ? String(round.measuredKg).replace('.', ',') : '',
    );
    // Se cierra el de vueltas en vez de apilar dos diálogos: con dos
    // encima, el de arriba queda con doble velo y el teclado se pelea con
    // los dos contenedores.
    setInfoHarvesterId(null);
  }

  function closeMeasureDialog() {
    const harvesterId = measuring?.harvesterId ?? null;
    setMeasuring(null);
    // Vuelve al listado de vueltas, que es de donde se entró — y ya
    // muestra el peso recién anotado.
    setInfoHarvesterId(harvesterId);
  }

  async function saveMeasure(measuredKg: number | null) {
    if (!measuring) {
      return;
    }

    const { harvesterId, round } = measuring;
    setSavingMeasure(true);
    try {
      // `synced: false` vuelve a poner la anotación en la cola de subida:
      // el server, al recibirla de nuevo, actualiza **solo** measuredKg y
      // deja intactos los envases y los kilos (ver harvest-entries.service).
      await db
        .update(harvestEntries)
        .set({ measuredKg, synced: false })
        .where(eq(harvestEntries.id, round.id));

      setEntriesByHarvester((prev) => ({
        ...prev,
        [harvesterId]: (prev[harvesterId] ?? []).map((entry) =>
          entry.id === round.id ? { ...entry, measuredKg } : entry,
        ),
      }));

      closeMeasureDialog();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingMeasure(false);
    }
  }

  function submitMeasure() {
    const value = parseDecimalInput(measureInput);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    saveMeasure(roundToOneDecimal(value));
  }

  // La diferencia contra lo que dice el envase, en vivo mientras se tipea:
  // es el dato por el que alguien pesa (¿van llenas de más o de menos?), y
  // verlo antes de guardar evita tener que ir a buscarlo después.
  const measureDifference = (() => {
    if (!measuring) {
      return null;
    }

    const value = parseDecimalInput(measureInput);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const difference = roundToOneDecimal(
      value - Math.abs(measuring.round.totalKg),
    );

    return strings.weighing.difference(formatKg(difference), difference > 0);
  })();

  const infoHarvester = infoHarvesterId
    ? harvestersById[infoHarvesterId]
    : null;
  // El número de vuelta se calcula ANTES de dar vuelta el orden — así el
  // número (posición cronológica real) nunca depende de cómo se termina
  // mostrando. entriesByHarvester ya viene en orden ascendente (ver load()),
  // así que index+1 = número de vuelta real; el .reverse() de después es
  // puramente de presentación, para que la más reciente quede arriba.
  const infoRounds = infoHarvesterId
    ? (entriesByHarvester[infoHarvesterId] ?? [])
        .map((round, index) => ({ ...round, roundNumber: index + 1 }))
        .reverse()
    : [];

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, title: strings.anotador.title }} />

      {workdayDate && isFromPreviousDay(workdayDate) ? (
        <Text style={styles.previousDayWarning}>
          {strings.workday.unclosed.recordingOn(
            new Date(workdayDate).toLocaleDateString('es-CL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }),
          )}
        </Text>
      ) : null}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{strings.anotador.grandTotal}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryValue}>
            {formatKg(grandTotalKg)}
            <Text style={styles.summaryUnit}> {strings.anotador.kg}</Text>
          </Text>
          <Text style={styles.summaryMeta}>
            {strings.history.workersCount(roster.length)}
          </Text>
        </View>
      </View>

      <View style={styles.linkRow}>
        <Button
          mode="outlined"
          icon="cloud-upload-outline"
          onPress={() => router.push('/sync')}
          style={styles.linkButton}
        >
          {strings.sync.title}
        </Button>
        <Button
          mode="outlined"
          icon="flag-checkered"
          onPress={() =>
            router.push({
              pathname: '/workday/[id]/close',
              params: { id: workdayId },
            })
          }
          style={styles.linkButton}
        >
          {strings.workday.closeTitle}
        </Button>
      </View>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <FlatList
        data={roster}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const harvester = harvestersById[item.harvesterId];
          const totals = totalsByHarvester[item.harvesterId] ?? {
            unitCount: 0,
            totalKg: 0,
          };
          const name = harvester
            ? `${harvester.firstName} ${harvester.lastName}`
            : '...';

          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowNumber}>{item.workdayNumber}</Text>
                <View style={styles.rowHeaderText}>
                  <Text variant="titleMedium">{name}</Text>
                  <BounceOnChange
                    value={entriesByHarvester[item.harvesterId]?.length ?? 0}
                    style={styles.rowSubtitleWrap}
                  >
                    <Text variant="bodyMedium" style={styles.rowSubtitle}>
                      {strings.anotador.containers(totals.unitCount)} ·{' '}
                      {formatKg(totals.totalKg)} {strings.anotador.kg}
                    </Text>
                  </BounceOnChange>
                </View>
                <IconButton
                  icon="information-outline"
                  size={20}
                  accessibilityLabel={strings.anotador.roundsTitle}
                  onPress={() => setInfoHarvesterId(item.harvesterId)}
                />
              </View>

              {isDirectWeighing ? (
                <Button
                  mode="contained"
                  onPress={() => openWeightDialog(item.harvesterId)}
                  style={styles.weighButton}
                >
                  {strings.anotador.recordWeight}
                </Button>
              ) : (
                // Los cuatro se mantienen apretados, no solo el -1: con
                // cualquiera, un toque que no se sabe si anotó puede terminar
                // en apretar de nuevo y sumar de más (decisión del usuario).
                <View style={styles.buttonRow}>
                  <HoldToRecordButton
                    label="-1"
                    variant="outlined"
                    onComplete={() => recordDelivery(item.harvesterId, -1)}
                    onReleasedEarly={showHoldHint}
                  />
                  <HoldToRecordButton
                    label="+1"
                    variant="contained"
                    onComplete={() => recordDelivery(item.harvesterId, 1)}
                    onReleasedEarly={showHoldHint}
                    style={styles.mainButton}
                  />
                  <HoldToRecordButton
                    label="+2"
                    variant="outlined"
                    onComplete={() => recordDelivery(item.harvesterId, 2)}
                    onReleasedEarly={showHoldHint}
                  />
                  <HoldToRecordButton
                    label="+5"
                    variant="outlined"
                    onComplete={() => recordDelivery(item.harvesterId, 5)}
                    onReleasedEarly={showHoldHint}
                  />
                </View>
              )}
            </View>
          );
        }}
      />

      <FAB
        icon="account-plus"
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/workday/[id]/add-harvester',
            params: { id: workdayId },
          })
        }
      />

      {toast ? (
        <Snackbar
          key={toast.id}
          visible={toastVisible}
          onDismiss={() => setToastVisible(false)}
          duration={toast.duration}
          action={
            toast.recorded
              ? {
                  label: strings.anotador.undo,
                  onPress: () => {
                    if (toast.recorded) {
                      undoRecord(toast.recorded);
                    }
                  },
                }
              : undefined
          }
        >
          {toast.message}
        </Snackbar>
      ) : null}

      <Portal>
        {/* KeyboardAwareDialog: tiene el campo de peso adentro y en iOS el
            teclado tapaba media tarjeta. El de vueltas de más abajo no lo
            necesita, ahí nunca sube el teclado. */}
        <KeyboardAwareDialog
          visible={weightDialogHarvesterId !== null}
          onDismiss={() => setWeightDialogHarvesterId(null)}
        >
          <Dialog.Title>{strings.anotador.recordWeight}</Dialog.Title>
          <Dialog.Content>
            <SegmentedButtons
              value={weightMode}
              onValueChange={(value) =>
                setWeightMode(value as 'add' | 'discount')
              }
              style={styles.weightModeToggle}
              // SegmentedButtons no tiene una prop directa para el color del
              // tab seleccionado — Paper lo pinta con
              // theme.colors.secondaryContainer, que por defecto es el
              // naranjo fijo de `secondary` (mismo motivo por el que se
              // veía igual en el onboarding). Override acotado al color
              // primario del tema activo, consistente con el resto de la
              // app (mismo patrón ya usado en AuthForm).
              theme={{
                colors: {
                  secondaryContainer: palette.primary,
                  onSecondaryContainer: palette.surface,
                },
              }}
              buttons={[
                { value: 'add', label: strings.anotador.addWeight },
                { value: 'discount', label: strings.anotador.discountWeight },
              ]}
            />
            <TextInput
              label={strings.anotador.weightLabel}
              value={weightInput}
              // Enmascara mientras se tipea en vez de redondear al guardar:
              // así el 3 de "20,23" simplemente no aparece, y nadie se lleva
              // la sorpresa de haber anotado algo distinto a lo que escribió.
              // Acepta coma o punto porque el decimal-pad de Android muestra
              // uno u otro según el idioma del teléfono.
              onChangeText={(text) => setWeightInput(sanitizeDecimalInput(text))}
              keyboardType="decimal-pad"
              autoFocus
            />
            <HelperText type="info">{strings.anotador.weightHelp}</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWeightDialogHarvesterId(null)}>
              {strings.common.cancel}
            </Button>
            <Button onPress={submitWeight}>{strings.common.save}</Button>
          </Dialog.Actions>
        </KeyboardAwareDialog>

        <Dialog
          visible={infoHarvesterId !== null}
          onDismiss={() => setInfoHarvesterId(null)}
        >
          <Dialog.Title>
            {infoHarvester
              ? `${infoHarvester.firstName} ${infoHarvester.lastName}`
              : strings.anotador.roundsTitle}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.roundsScrollArea}>
            <ScrollView>
              {infoRounds.length === 0 ? (
                <Text style={styles.noRounds}>
                  {strings.anotador.noRoundsYet}
                </Text>
              ) : (
                <>
                  {/* Solo con envases de peso fijo: en modo pesaje la vuelta
                      ya trae su peso real, no hay nada que agregarle. */}
                  {isDirectWeighing ? null : (
                    <Text variant="bodySmall" style={styles.measureHint}>
                      {strings.anotador.measureHint}
                    </Text>
                  )}
                  {infoRounds.map((round) => {
                    const row = (
                      <View style={styles.roundRow}>
                        <Text variant="titleSmall">
                          {strings.anotador.round(round.roundNumber)}
                        </Text>
                        <Text>
                          {strings.anotador.containers(round.unitCount)} ·{' '}
                          {formatKg(round.totalKg)} {strings.anotador.kg}
                        </Text>
                        {round.measuredKg != null ? (
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.roundMeasured,
                              { color: palette.primary },
                            ]}
                          >
                            {strings.weighing.roundMeasured(
                              formatKg(round.measuredKg),
                            )}
                          </Text>
                        ) : null}
                        <Text variant="bodySmall" style={styles.roundTime}>
                          {new Date(round.recordedAt).toLocaleTimeString(
                            'es-CL',
                            { hour: '2-digit', minute: '2-digit' },
                          )}
                        </Text>
                      </View>
                    );

                    // Una corrección (-1) no se pesa: lo que se controla es
                    // lo que se entregó, no el descuento.
                    return isDirectWeighing || round.unitCount <= 0 ? (
                      <View key={round.id}>{row}</View>
                    ) : (
                      <TouchableRipple
                        key={round.id}
                        onPress={() =>
                          openMeasureDialog(infoHarvesterId ?? '', round)
                        }
                      >
                        {row}
                      </TouchableRipple>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setInfoHarvesterId(null)}>
              {strings.common.close}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* KeyboardAwareDialog porque tiene campo de texto (ver el
            componente): en iOS el teclado taparía el campo y los botones. */}
        <KeyboardAwareDialog
          theme={{ version: 3 }}
          visible={measuring !== null}
          onDismiss={closeMeasureDialog}
        >
          <Dialog.Title>
            {measuring
              ? strings.anotador.measureTitle(measuring.round.roundNumber)
              : ''}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={styles.measureExpected}>
              {measuring
                ? strings.anotador.measureExpected(
                    formatKg(Math.abs(measuring.round.totalKg)),
                  )
                : ''}
            </Text>
            <TextInput
              mode="outlined"
              label={strings.anotador.measureLabel}
              value={measureInput}
              onChangeText={(text) =>
                setMeasureInput(sanitizeDecimalInput(text))
              }
              keyboardType="decimal-pad"
              autoFocus
            />
            <HelperText type="info">
              {measureDifference ?? strings.anotador.weightHelp}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            {measuring?.round.measuredKg != null ? (
              <Button
                onPress={() => saveMeasure(null)}
                disabled={savingMeasure}
                textColor={palette.textSecondary}
              >
                {strings.anotador.measureRemove}
              </Button>
            ) : null}
            <Button onPress={closeMeasureDialog} disabled={savingMeasure}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={submitMeasure}
              loading={savingMeasure}
              disabled={savingMeasure}
            >
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </KeyboardAwareDialog>
      </Portal>
    </Screen>
  );
}

// Da un salto cada vez que `value` cambia (no al montar): el "sí anotó" que
// se ve en la fila del cosechador, junto con la vibración y el aviso. Sube
// y vuelve con un resorte, en el hilo nativo.
function BounceOnChange({
  value,
  style,
  children,
}: PropsWithChildren<{ value: number; style?: StyleProp<ViewStyle> }>) {
  const scale = useRef(new Animated.Value(1)).current;
  const previousRef = useRef(value);

  useEffect(() => {
    if (previousRef.current === value) {
      return;
    }
    previousRef.current = value;
    scale.stopAnimation();
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.2,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value, scale]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

// Función en vez de StyleSheet.create() estático: rowNumber usa el primary
// del tema activo (usePalette), así que los estilos deben recalcularse
// cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    // Mismo tile redondeado con fondo primarySoft que ya usan el código de
    // invitación (Ajustes) y el total de Cerrar Jornada. Compacto a
    // propósito: acá abajo va el roster con los botones de anotar, que es
    // lo que de verdad necesita el espacio vertical.
    // Una línea de texto ámbar, no un banner con fondo: el espacio vertical
    // de esta pantalla es para el roster y los botones de anotar, y la
    // jornada no está rota — solo es de otro día.
    previousDayWarning: {
      color: colors.warning,
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    summaryCard: {
      backgroundColor: colors.primarySoft,
      borderRadius: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
    },
    // Plana, no el estilo de encabezado de sección (mayúsculas + 700): ese
    // es para títulos sobre listas, y dentro del tile competía con el
    // número. Mismo tratamiento que la etiqueta del total en Inicio y en
    // Cerrar Jornada.
    summaryLabel: { color: colors.textSecondary, fontSize: 13 },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    summaryValue: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: 32,
      lineHeight: 38,
    },
    summaryUnit: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    summaryMeta: { color: colors.textSecondary },
    linkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    linkButton: { flex: 1 },
    list: { paddingBottom: spacing.xl * 2 },
    row: {
      paddingVertical: spacing.lg,
      marginBottom: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    rowNumber: {
      width: spacing.lg,
      textAlign: 'center',
      color: colors.primary,
      fontWeight: '700',
    },
    rowHeaderText: { flex: 1, marginLeft: spacing.sm },
    // El salto crece desde la izquierda y solo del ancho del texto, para que
    // no se corra hacia el centro de la fila.
    rowSubtitleWrap: { alignSelf: 'flex-start', transformOrigin: 'left' },
    rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
    // Alto y ancho mínimos de los botones de anotar: ver HoldToRecordButton
    // (TOUCH_TARGET_MIN, la acción más repetida de la app).
    buttonRow: { flexDirection: 'row', gap: spacing.sm },
    mainButton: { flex: 1 },
    // A diferencia de -1/+1/+2/+5 (la acción más repetida de toda la app,
    // RNF-02, por eso TOUCH_TARGET_MIN), pesar es una acción más deliberada
    // que abre un diálogo — no necesita el mismo tamaño gigante, y
    // alignSelf:flex-start evita que se estire a lo ancho de toda la fila.
    weighButton: { alignSelf: 'flex-start' },
    weightModeToggle: { marginBottom: spacing.md },
    fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
    roundsScrollArea: { maxHeight: 320 },
    roundRow: {
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    measureHint: {
      color: colors.textSecondary,
      paddingBottom: spacing.sm,
    },
    measureExpected: {
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    roundMeasured: { fontWeight: '700', marginTop: 2 },
    roundTime: { color: colors.textSecondary, marginTop: spacing.xs },
    noRounds: { paddingVertical: spacing.md },
  });
}

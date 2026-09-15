import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { FindWorkdayResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import {
  getUsersControllerFindMeQueryKey,
  useUsersControllerFindMe,
} from '@/api/generated/users/users';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import {
  products,
  harvesters as harvestersTable,
  harvestEntries,
  harvesterWorkday,
  workdays,
} from '@/db/schema';
import { syncCatalogs } from '@/lib/catalogSync';
import { syncClaims } from '@/lib/claimsSync';
import { syncFarmSettings } from '@/lib/farmSettings';
import { formatKg } from '@/lib/format';
import { readProductsById, type ProductInfo } from '@/lib/localCatalogNames';
import { useCapabilities } from '@/lib/permissions';
import { getActiveWorkdayWithRecovery } from '@/lib/recoverActiveWorkday';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { isFromPreviousDay } from '@/lib/workdayDate';
import { useActiveWorkdayStore, useAuthStore, usePalette } from '@/stores';
import { spacing } from '@/theme';

interface RosterPreviewRow {
  harvesterId: string;
  workdayNumber: number;
  name: string;
  totalKg: number;
}

interface ActiveWorkdayPreview {
  id: string;
  productName: string;
  productIcon: string;
  date: string;
  grandTotalKg: number;
  pendingCount: number;
  roster: RosterPreviewRow[];
}

interface ActiveTeammateRow {
  workdayServerId: string;
  recorderName: string;
  productName: string;
  productIcon: string;
}

const ROSTER_PREVIEW_LIMIT = 5;
const TEAMMATES_PREVIEW_LIMIT = 5;

// Home es la pantalla de aterrizaje de cada apertura de la app, así que
// también es el punto natural "ya-online" del ciclo para refrescar la caché
// local de catálogos y el interruptor de la farm (fire-and-forget, no
// bloquea el render de abajo).
async function loadActiveWorkdayPreview(
  workdayId: string,
): Promise<ActiveWorkdayPreview> {
  const [workdayRows, productRows, harvestersRows, rosterRows, entryRows] =
    await Promise.all([
      db.select().from(workdays).where(eq(workdays.id, workdayId)),
      db.select().from(products),
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
  const workdayRow = workdayRows[0];

  const productsById: Record<string, { name: string; icon: string }> = {};
  productRows.forEach((product) => {
    productsById[product.id] = {
      name: product.name,
      icon: product.icon ?? DEFAULT_PRODUCT_ICON,
    };
  });
  const harvesterNamesById: Record<string, string> = {};
  harvestersRows.forEach((harvester) => {
    harvesterNamesById[harvester.id] = `${harvester.firstName} ${harvester.lastName}`;
  });

  const totalKgByHarvester: Record<string, number> = {};
  let grandTotalKg = 0;
  let pendingCount = 0;
  entryRows.forEach((entry) => {
    totalKgByHarvester[entry.harvesterId] =
      (totalKgByHarvester[entry.harvesterId] ?? 0) + entry.totalKg;
    grandTotalKg += entry.totalKg;
    if (!entry.synced) {
      pendingCount += 1;
    }
  });
  rosterRows.forEach((row) => {
    if (!row.synced) {
      pendingCount += 1;
    }
  });
  // La jornada misma, si se abrió sin conexión y todavía no subió — mismo
  // criterio que la pantalla de Sincronizar y la de Cerrar Jornada.
  if (workdayRow && !workdayRow.synced) {
    pendingCount += 1;
  }

  const roster = rosterRows
    .map((row) => ({
      harvesterId: row.harvesterId,
      workdayNumber: row.workdayNumber,
      name: harvesterNamesById[row.harvesterId] ?? '...',
      totalKg: totalKgByHarvester[row.harvesterId] ?? 0,
    }))
    .sort((a, b) => a.workdayNumber - b.workdayNumber);

  const product = workdayRow ? productsById[workdayRow.productId] : undefined;

  return {
    id: workdayId,
    productName: product?.name ?? '',
    productIcon: product?.icon ?? DEFAULT_PRODUCT_ICON,
    date: workdayRow?.date ?? '',
    grandTotalKg,
    pendingCount,
    roster,
  };
}

// Coordinación entre anotadores (pedido del usuario, 2026-09-04): quién más
// tiene una jornada abierta *ahora mismo*, para saber quién ya está en
// terreno sin tener que preguntar por otro lado. Deliberadamente acotado —
// solo nombre + fruta de quien está activo, no el roster completo del
// equipo ni sus roles (eso sigue siendo admin-only en Mi equipo). Server-app
// no necesitó cambios: `GET /workdays?status=OPEN` ya lo puede llamar
// cualquier miembro de la farm (FarmScopeGuard, no RolesGuard), y
// `recorderName` ya viene resuelto en la respuesta (se agregó para el
// Historial). Si falla (sin conexión, etc.) la sección simplemente no se
// muestra — es secundaria, no bloquea el resto de Home.
//
// Excluye las jornadas propias comparando `recorderId` contra el `_id` de
// Mongo de la cuenta (GET /users/me). Antes lo comparaba contra el uid de
// Firebase, que nunca coincide — `recorderId` es una referencia a `users` —,
// así que la propia jornada aparecía en "quién más está en terreno".
function buildActiveTeammates(
  openWorkdays: FindWorkdayResponseDto[],
  myUserId: string,
  productsById: Record<string, ProductInfo>,
): ActiveTeammateRow[] {
  return openWorkdays
    .filter(
      (workday) =>
        workday.recorderId &&
        workday.recorderId !== myUserId &&
        workday.recorderName,
    )
    .map((workday) => {
      const product = productsById[workday.productId];
      return {
        workdayServerId: workday._id,
        recorderName: workday.recorderName!,
        productName: product?.name ?? workday.productId,
        productIcon: product?.icon ?? DEFAULT_PRODUCT_ICON,
      };
    });
}

const OPEN_WORKDAYS = { status: 'OPEN' } as const;

export default function HomeScreen() {
  const router = useRouter();
  const uid = useAuthStore((state) => state.user?.uid);
  // El supervisor es de solo lectura (pedido del usuario, 2026-09-04) —
  // nunca abre jornadas, así que acá no tiene sentido ofrecerle el botón
  // "Abrir Jornada" (nada se lo bloquea del lado del server todavía, es
  // puramente evitar la confusión de un flujo que no le corresponde).
  const canRecord = useCapabilities().canRecord;
  const setActiveWorkdayId = useActiveWorkdayStore(
    (state) => state.setActiveWorkdayId,
  );
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [preview, setPreview] = useState<ActiveWorkdayPreview | null>(null);
  // Solo cubre la primera carga del preview (local). Las recargas al volver a
  // Home actualizan sin prender el spinner — mismo arreglo que el Anotador:
  // si no, la pantalla entera pestañea cada vez que se vuelve a ella.
  const [loading, setLoading] = useState(true);
  // Una jornada que quedó abierta de un día anterior: Inicio es la pantalla
  // donde la persona aterriza al abrir la app, así que es acá donde se tiene
  // que enterar — sin esto, el preview de ayer se lee igual que el de hoy.
  const isUnclosed = preview ? isFromPreviousDay(preview.date) : false;

  // "Equipo activo ahora", separado del preview a propósito: antes Home
  // entera esperaba esta petición antes de mostrar la jornada propia, que es
  // local — con señal mala, hasta 15s de spinner para algo que SQLite tiene
  // al instante. Ahora el preview sale primero y esta sección aparece cuando
  // responde la red. Comparte caché con Mi equipo (misma query key).
  const openWorkdaysQuery = useWorkdaysControllerFindAll(OPEN_WORKDAYS);
  useRefreshOnFocus([openWorkdaysQuery.queryKey]);
  // Solo se usa el _id, que no cambia nunca: staleTime infinito para que
  // este observador no la vuelva a pedir cada vez que la app vuelve al
  // frente. (Perfil usa la misma key con su propio staleTime.)
  const meQuery = useUsersControllerFindMe({
    // Los tipos de orval piden la key cuando se pasan opciones; es la misma
    // que el hook usaría solo.
    query: { queryKey: getUsersControllerFindMeQueryKey(), staleTime: Infinity },
  });
  const [productsById, setProductsById] = useState(readProductsById);
  const teammates = useMemo(
    () =>
      openWorkdaysQuery.data && meQuery.data
        ? buildActiveTeammates(
            openWorkdaysQuery.data,
            meQuery.data._id,
            productsById,
          )
        : [],
    [openWorkdaysQuery.data, meQuery.data, productsById],
  );

  // useFocusEffect: al volver de cerrar/abrir una jornada (u otra pantalla)
  // Home sigue montado en el stack, hay que revisar de nuevo cada vez que
  // vuelve a tener foco, no solo al montarse.
  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        return;
      }

      let cancelled = false;

      // Los nombres de cultivo se releen recién cuando termina el sync de
      // catálogos (dedupeado por su propio guard `inFlight`): si se leyeran
      // antes, un cultivo de un compañero que este dispositivo todavía no
      // tenía se mostraría con el fallback genérico (🍎 + el _id crudo) — bug
      // real, encontrado en dispositivo, se veía bien recién la segunda vez
      // que se visitaba Home.
      syncCatalogs().then(() => {
        if (!cancelled) {
          setProductsById(readProductsById());
        }
      });
      syncFarmSettings();
      // Si un admin le cambió los roles, el token de este dispositivo sigue
      // siendo el viejo hasta que Firebase lo refresque solo (~1h). Acá se
      // detecta y se fuerza el refresco — ver lib/claimsSync.ts.
      syncClaims();

      (async () => {
        try {
          const workday = await getActiveWorkdayWithRecovery(uid);
          if (cancelled) {
            return;
          }
          setActiveWorkdayId(workday?.id ?? null);

          // El .catch() no es decorativo: cualquier error acá sin él dejaba
          // `loading` en true para siempre (bug real, encontrado en
          // dispositivo).
          const loadedPreview = workday
            ? await loadActiveWorkdayPreview(workday.id).catch(() => null)
            : null;
          if (cancelled) {
            return;
          }
          setPreview(loadedPreview);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [uid, setActiveWorkdayId]),
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {preview ? (
              <View>
                <Text
                  style={[styles.eyebrow, isUnclosed ? styles.eyebrowWarning : null]}
                >
                  {isUnclosed
                    ? strings.workday.unclosed.eyebrow
                    : strings.home.activeWorkday}
                </Text>
                <Text variant="titleLarge" style={styles.productName}>
                  {preview.productIcon} {preview.productName}
                </Text>
                <Text
                  style={[styles.dateText, isUnclosed ? styles.dateTextTight : null]}
                >
                  {new Date(preview.date).toLocaleDateString('es-CL', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </Text>
                {isUnclosed ? (
                  <Text style={styles.unclosedHelp}>
                    {strings.workday.unclosed.help}
                  </Text>
                ) : null}

                <Text style={styles.totalLabel}>{strings.workday.totalKg}</Text>
                <Text style={styles.totalValue}>
                  {formatKg(preview.grandTotalKg)}
                  <Text style={styles.totalUnit}> {strings.anotador.kg}</Text>
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {strings.home.workersCount(preview.roster.length)}
                  </Text>
                  <Text
                    style={[
                      styles.metaText,
                      preview.pendingCount > 0 ? styles.pendingWarning : null,
                    ]}
                  >
                    {preview.pendingCount === 0
                      ? strings.sync.synced
                      : strings.sync.pendingCount(preview.pendingCount)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionLabel}>{strings.home.todayTeam}</Text>
                {preview.roster.length === 0 ? (
                  <Text style={styles.emptyRoster}>{strings.admin.emptyList}</Text>
                ) : (
                  preview.roster.slice(0, ROSTER_PREVIEW_LIMIT).map((row) => (
                    <View key={row.harvesterId} style={styles.rosterRow}>
                      <Text style={styles.rosterNumber}>{row.workdayNumber}</Text>
                      <Text style={styles.rosterName}>{row.name}</Text>
                      <Text style={styles.rosterTotal}>
                        {formatKg(row.totalKg)} {strings.anotador.kg}
                      </Text>
                    </View>
                  ))
                )}
                {preview.roster.length > ROSTER_PREVIEW_LIMIT ? (
                  <Text style={styles.moreWorkers}>
                    {strings.home.moreWorkers(
                      preview.roster.length - ROSTER_PREVIEW_LIMIT,
                    )}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {canRecord
                    ? strings.home.noActiveWorkday
                    : strings.home.supervisorEmptyState}
                </Text>
                {canRecord ? (
                  <Button
                    mode="contained"
                    onPress={() => router.push('/open-workday')}
                  >
                    {strings.home.openWorkday}
                  </Button>
                ) : null}
              </View>
            )}

            {teammates.length > 0 ? (
              <View style={preview ? styles.teammatesSectionWithPreview : undefined}>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>
                  {strings.home.teamActiveNow}
                </Text>
                {teammates.slice(0, TEAMMATES_PREVIEW_LIMIT).map((row) => (
                  <TouchableRipple
                    key={row.workdayServerId}
                    onPress={() =>
                      router.push({
                        pathname: '/history/[id]',
                        params: { id: row.workdayServerId },
                      })
                    }
                  >
                    <View style={styles.teammateRow}>
                      <Text style={styles.teammateProduct}>
                        {row.productIcon} {row.productName}
                      </Text>
                      <Text style={styles.teammateName} numberOfLines={1}>
                        {row.recorderName}
                      </Text>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={palette.textSecondary}
                      />
                    </View>
                  </TouchableRipple>
                ))}
                {teammates.length > TEAMMATES_PREVIEW_LIMIT ? (
                  <Text style={styles.moreWorkers}>
                    {strings.home.moreWorkers(
                      teammates.length - TEAMMATES_PREVIEW_LIMIT,
                    )}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {preview ? (
            // Con una jornada sin cerrar de otro día, la acción principal
            // pasa a ser cerrarla (es lo que desbloquea abrir la de hoy),
            // pero el Anotador queda igual de alcanzable en un toque: puede
            // faltarle corregir una entrega antes de congelar el total.
            isUnclosed ? (
              <>
                <Button
                  mode="contained"
                  onPress={() =>
                    router.push({
                      pathname: '/workday/[id]/close',
                      params: { id: preview.id },
                    })
                  }
                >
                  {strings.workday.close}
                </Button>
                <Button
                  mode="text"
                  onPress={() =>
                    router.push({
                      pathname: '/workday/[id]/anotador',
                      params: { id: preview.id },
                    })
                  }
                  textColor={palette.primary}
                >
                  {strings.home.goToAnotador}
                </Button>
              </>
            ) : (
              <Button
                mode="contained"
                onPress={() =>
                  router.push({
                    pathname: '/workday/[id]/anotador',
                    params: { id: preview.id },
                  })
                }
              >
                {strings.home.goToAnotador}
              </Button>
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

// Función en vez de un StyleSheet.create() estático a nivel de módulo:
// `colors.primary` cambia según el tema elegido en Ajustes (usePalette), así
// que los estilos que lo usan (eyebrow, rosterNumber) tienen que recalcularse
// cuando cambia — un objeto fijo calculado una sola vez al importar el
// archivo se quedaría pegado en el tema con el que arrancó la app.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.md },
  emptyState: { alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  emptyStateText: { color: colors.textSecondary },
  eyebrow: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  productName: { fontWeight: '700' },
  // El ámbar de warning, no el rojo de error: la jornada de ayer no está
  // rota ni se perdió nada, solo falta cerrarla.
  eyebrowWarning: { color: colors.warning },
  dateText: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textTransform: 'capitalize',
  },
  // Cuando abajo viene la explicación de por qué está sin cerrar, la fecha
  // no lleva el aire de siempre — las dos líneas son una sola idea.
  dateTextTight: { marginBottom: spacing.xs },
  unclosedHelp: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  totalLabel: { color: colors.textSecondary, fontSize: 13 },
  totalValue: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 40,
    lineHeight: 46,
    marginBottom: spacing.sm,
  },
  totalUnit: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  metaRow: { marginBottom: spacing.lg, gap: spacing.xs / 2 },
  metaText: { color: colors.textSecondary },
  pendingWarning: { color: colors.warning, fontWeight: '600' },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rosterNumber: {
    width: spacing.lg,
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '700',
  },
  rosterName: { flex: 1, marginLeft: spacing.sm },
  rosterTotal: { color: colors.textSecondary },
  emptyRoster: { paddingVertical: spacing.sm, color: colors.textSecondary },
  moreWorkers: { color: colors.textSecondary, paddingTop: spacing.sm },
  teammatesSectionWithPreview: { marginTop: spacing.md },
  teammateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  teammateProduct: { fontWeight: '600' },
  teammateName: { flex: 1, color: colors.textSecondary, textAlign: 'right' },
  });
}

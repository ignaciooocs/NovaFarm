import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { readLocalWorkdays, type LocalWorkdaySummary } from '@/db/queries';
import { formatKg } from '@/lib/format';
import { readProductsById, useLocalRead } from '@/lib/localCatalogNames';
import { showErrorToast, usePalette } from '@/stores';
import { spacing } from '@/theme';

// Historial local: lo que este celular guardó de cada jornada, se haya
// subido o no (pedido del usuario, 2026-09-20). El Historial de al lado
// muestra lo que tiene el **server**; acá está la otra mitad, la que permite
// comparar cuando algo quedó pendiente o el server lo rechazó.
//
// 100% SQLite, sin React Query: es justamente la vista que tiene que servir
// sin señal y mostrar lo que el server todavía no sabe (ver "Capa de API" en
// ui-arquitectura.md).
export default function LocalHistoryScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const productsById = useLocalRead(readProductsById);

  const [workdays, setWorkdays] = useState<LocalWorkdaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Al foco y sin prender el spinner más que la primera vez, mismo criterio
  // que el Anotador: al volver de sincronizar, los estados cambian.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readLocalWorkdays()
        .then((rows) => {
          if (!cancelled) {
            setWorkdays(rows);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            showErrorToast(err);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, title: strings.localHistory.title }}
      />

      <Text style={styles.subtitle}>{strings.localHistory.subtitle}</Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={workdays}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>{strings.localHistory.empty}</Text>
          }
          renderItem={({ item }) => {
            const product = productsById[item.productId];
            // La jornada misma cuenta como pendiente si se abrió sin señal y
            // todavía no subió — mismo criterio que Cerrar Jornada.
            const pending =
              (item.synced ? 0 : 1) + item.pendingRoster + item.pendingEntries;

            return (
              <TouchableRipple
                onPress={() =>
                  router.push({
                    pathname: '/local-history/[id]',
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.row}>
                  <View style={styles.rowMain}>
                    <View style={styles.rowTopLine}>
                      <Text
                        variant="titleMedium"
                        style={styles.rowTitle}
                        numberOfLines={1}
                      >
                        {product?.icon ?? DEFAULT_PRODUCT_ICON}{' '}
                        {product?.name ?? strings.localHistory.unknownProduct}
                      </Text>
                      <Text style={styles.rowTotal}>
                        {formatKg(item.totalKg)} {strings.anotador.kg}
                      </Text>
                    </View>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {new Date(item.date).toLocaleDateString('es-CL')} ·{' '}
                      {strings.localHistory.rounds(item.entryCount)}
                    </Text>
                    <Text
                      style={[
                        styles.rowState,
                        // Dada por perdida no es una alerta: ya se decidió.
                        pending > 0 && !item.syncSkipped
                          ? styles.rowStatePending
                          : null,
                      ]}
                      numberOfLines={1}
                    >
                      {item.syncSkipped
                        ? strings.localHistory.skippedState
                        : pending > 0
                          ? strings.localHistory.pending(pending)
                          : item.status === 'CLOSED'
                            ? strings.localHistory.closedAndSynced
                            : strings.localHistory.openAndSynced}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={palette.textSecondary}
                  />
                </View>
              </TouchableRipple>
            );
          }}
        />
      )}
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: rowTotal usa el primary
// del tema activo (usePalette).
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    subtitle: {
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    empty: { paddingTop: spacing.md, color: colors.textSecondary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowMain: { flex: 1 },
    rowTopLine: { flexDirection: 'row', alignItems: 'baseline' },
    rowTitle: { flex: 1, marginRight: spacing.sm },
    rowTotal: { fontWeight: '700', color: colors.primary },
    rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
    rowState: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    rowStatePending: { color: colors.warning, fontWeight: '700' },
  });
}

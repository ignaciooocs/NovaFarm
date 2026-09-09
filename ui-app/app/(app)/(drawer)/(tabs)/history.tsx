import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  HelperText,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { FindWorkdayResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { db } from '@/db/client';
import { products } from '@/db/schema';
import { getErrorMessage } from '@/lib/errors';
import { formatKg } from '@/lib/format';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

interface ProductInfo {
  name: string;
  icon: string;
}

// Lista de jornadas cerradas de la farm. Es una acción online igual que los
// catálogos de admin (no RF-01: una jornada ya cerrada no es captura en
// terreno) — se pide en vivo cada vez. Los nombres de fruta sí se resuelven
// contra la caché local (lib/catalogSync.ts) en vez de otro pedido en vivo,
// ya que products guarda el catálogo completo (activas e inactivas), y una
// jornada vieja puede apuntar a una fruta que ya se desactivó.
export default function HistoryScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [workdays, setWorkdays] = useState<FindWorkdayResponseDto[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        setLoading(true);
        setError(null);
        try {
          const { workdaysControllerFindAll } = getWorkdays();
          const [closedWorkdays, productRows] = await Promise.all([
            workdaysControllerFindAll({ status: 'CLOSED' }),
            db.select().from(products),
          ]);
          if (cancelled) {
            return;
          }

          const byId: Record<string, ProductInfo> = {};
          productRows.forEach((product) => {
            byId[product.id] = {
              name: product.name,
              icon: product.icon ?? DEFAULT_PRODUCT_ICON,
            };
          });
          setProductsById(byId);

          setWorkdays(
            [...closedWorkdays].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            ),
          );
        } catch (err) {
          if (!cancelled) {
            setError(getErrorMessage(err));
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {error ? <HelperText type="error">{error}</HelperText> : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={workdays}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={
            <Text style={styles.empty}>{strings.admin.emptyList}</Text>
          }
          renderItem={({ item }) => {
            const product = productsById[item.productId];
            return (
              <TouchableRipple
                onPress={() =>
                  router.push({
                    pathname: '/history/[id]',
                    params: { id: item._id },
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
                        {product ? `${product.icon} ${product.name}` : item.productId}
                      </Text>
                      <Text style={styles.rowTotal}>
                        {formatKg(item.finalTotalKg ?? 0)}{' '}
                        {strings.anotador.kg}
                      </Text>
                    </View>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {new Date(item.date).toLocaleDateString('es-CL')}
                      {item.recorderName ? ` · ${item.recorderName}` : ''}
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
// del tema activo (usePalette), así que los estilos deben recalcularse
// cuando el usuario cambia de tema en Ajustes.
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    empty: { paddingTop: spacing.md, color: colors.textSecondary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowMain: { flex: 1, marginRight: spacing.sm },
    rowTopLine: { flexDirection: 'row', alignItems: 'baseline' },
    rowTitle: { flex: 1, marginRight: spacing.sm },
    rowTotal: { fontWeight: '700', color: colors.primary },
    rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
  });
}

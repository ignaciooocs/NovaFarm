import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  HelperText,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { formatKg } from '@/lib/format';
import { readProductsById, useLocalRead } from '@/lib/localCatalogNames';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { usePalette } from '@/stores';
import { spacing } from '@/theme';

const CLOSED_WORKDAYS = { status: 'CLOSED' } as const;

// Lista de jornadas cerradas de la farm. Es una acción online igual que los
// catálogos de admin (no RF-01: una jornada ya cerrada no es captura en
// terreno), así que va por React Query: se pide cada vez que la pantalla
// recupera el foco, pero lo último que se trajo se ve al tiro mientras tanto
// — el spinner es solo para la primera vez. Los nombres de cultivo salen de
// la caché local (ver lib/localCatalogNames.ts).
export default function HistoryScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const closedWorkdays = useWorkdaysControllerFindAll(CLOSED_WORKDAYS);
  useRefreshOnFocus([closedWorkdays.queryKey]);
  const productsById = useLocalRead(readProductsById);

  const workdays = useMemo(
    () =>
      [...(closedWorkdays.data ?? [])].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [closedWorkdays.data],
  );

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {/* Con datos en caché y un refresco que falla (sin señal), se ven los
          dos: el aviso arriba y lo último que se trajo abajo. */}
      {closedWorkdays.error ? (
        <HelperText type="error">
          {getErrorMessage(closedWorkdays.error)}
        </HelperText>
      ) : null}

      {closedWorkdays.isPending ? (
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

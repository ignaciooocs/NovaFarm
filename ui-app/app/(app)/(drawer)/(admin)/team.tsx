import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useUsersControllerFindAll } from '@/api/generated/users/users';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { rolesLabelFor } from '@/lib/teamRoles';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { useErrorToast, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

const OPEN_WORKDAYS = { status: 'OPEN' } as const;

// Admin y supervisor ven esta pantalla (server-app: GET /users acepta
// 'admin'/'supervisor' vía RolesGuard — la pantalla ya está oculta del
// drawer para un recorder puro, ver (drawer)/_layout.tsx, esto es la
// segunda capa, real, del lado del server).
//
// Cada fila es solo nombre + roles, y se toca entera para ir al detalle
// (team/[id].tsx), donde viven el correo, editar roles y la jornada activa.
// Antes todo eso iba en la fila (correo · roles, "Jornada activa", un botón
// de editar) y en el ancho de un celular no se leía (pedido del usuario,
// 2026-09-15).
export default function TeamScreen() {
  const router = useRouter();
  const palette = usePalette();

  // Antes se pedía solo al montar, y como las pantallas del drawer quedan
  // montadas, volver acá mostraba datos viejos (ej. sin el "Jornada activa"
  // de alguien que acababa de abrir). Ahora se refresca en cada foco, con lo
  // último visible mientras tanto. El detalle usa estas mismas queries.
  const usersQuery = useUsersControllerFindAll();
  const openWorkdaysQuery = useWorkdaysControllerFindAll(OPEN_WORKDAYS);
  useRefreshOnFocus([usersQuery.queryKey, openWorkdaysQuery.queryKey]);

  // Quién tiene una jornada abierta ahora mismo — resuelto vía GET
  // /workdays?status=OPEN (mismo endpoint que usa Home, y con la misma query
  // key, así que comparten caché) en vez de agregar un campo nuevo a /users.
  // Jornadas en modo invitado (recorderId null) no marcan a nadie, a
  // propósito — no hay a quién atribuírselas.
  const recordersWithActiveWorkday = useMemo(
    () =>
      new Set(
        (openWorkdaysQuery.data ?? [])
          .map((workday) => workday.recorderId)
          .filter((recorderId): recorderId is string => Boolean(recorderId)),
      ),
    [openWorkdaysQuery.data],
  );

  useErrorToast(usersQuery.error ?? openWorkdaysQuery.error);

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.teamTitle}
      </Text>

      {/* Espera las dos: sin la de jornadas, la lista aparecería y las marcas
          de "Jornada activa" saltarían un instante después. Solo la primera
          vez — después hay caché. */}
      {usersQuery.isPending || openWorkdaysQuery.isPending ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={usersQuery.data ?? []}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => (
            <TouchableRipple
              onPress={() =>
                router.push({
                  pathname: '/team/[id]',
                  params: { id: item._id },
                })
              }
            >
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text variant="titleMedium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {rolesLabelFor(item.roles)}
                    {!item.active ? ` · ${strings.common.inactive}` : ''}
                    {recordersWithActiveWorkday.has(item._id) ? (
                      <Text style={[styles.activeBadge, { color: palette.primary }]}>
                        {' · '}
                        {strings.home.activeWorkday}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableRipple>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, marginRight: spacing.sm },
  rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
  activeBadge: { fontWeight: '700' },
});

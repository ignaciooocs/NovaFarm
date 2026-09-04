import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  HelperText,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { FindUserResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getUsers } from '@/api/generated/users/users';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

// Solo admin: server-app rechaza GET /users con 403 para un recorder
// (RolesGuard) — la pantalla en sí ya está oculta del drawer para ese rol
// (ver (drawer)/_layout.tsx), esto es la segunda capa, real, del lado del
// server. De momento solo lista (ver el usuario en la lista) — activar/
// desactivar y editar rol quedaron fuera a propósito por ahora.
export default function TeamScreen() {
  const router = useRouter();
  const palette = usePalette();
  const [users, setUsers] = useState<FindUserResponseDto[]>([]);
  // _id de la jornada abierta de cada recorder, si tiene una ahora mismo —
  // resuelto vía GET /workdays?status=OPEN (mismo endpoint que usa Home,
  // solo que acá se pide para toda la farm en vez de por cuenta) en vez de
  // agregar un campo nuevo a /users. El id sirve para poder tocar la fila y
  // ver esa jornada (history/[id].tsx, que ya sabe mostrar tanto jornadas
  // cerradas como abiertas). Jornadas en modo invitado (recorderId null) no
  // marcan a nadie, a propósito — no hay a quién atribuírselas.
  const [activeWorkdayByRecorder, setActiveWorkdayByRecorder] = useState<
    Map<string, string>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { usersControllerFindAll } = getUsers();
        const { workdaysControllerFindAll } = getWorkdays();
        const [usersResult, openWorkdays] = await Promise.all([
          usersControllerFindAll(),
          workdaysControllerFindAll({ status: 'OPEN' }),
        ]);
        setUsers(usersResult);
        setActiveWorkdayByRecorder(
          new Map(
            openWorkdays
              .filter((workday) => workday.recorderId)
              .map((workday) => [workday.recorderId as string, workday._id]),
          ),
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.teamTitle}
      </Text>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={<Text>{strings.admin.emptyList}</Text>}
          renderItem={({ item }) => {
            const roleLabel =
              item.role === 'admin'
                ? strings.admin.roleAdmin
                : strings.admin.roleRecorder;
            const activeWorkdayId = activeWorkdayByRecorder.get(item._id);

            const rowContent = (
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <View style={styles.rowTopLine}>
                    <Text
                      variant="titleMedium"
                      style={styles.rowTitle}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {activeWorkdayId ? (
                      <Text
                        style={[
                          styles.activeBadge,
                          { color: palette.primary },
                        ]}
                      >
                        {strings.home.activeWorkday}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.email} · {roleLabel}
                    {!item.active ? ` · ${strings.common.inactive}` : ''}
                  </Text>
                </View>
                {activeWorkdayId ? (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={colors.textSecondary}
                  />
                ) : null}
              </View>
            );

            // Solo se puede ver (nunca editar) la jornada activa de otra
            // persona, y solo si tiene una — sin jornada activa la fila no
            // es tocable, no hay nada que mostrar.
            return activeWorkdayId ? (
              <TouchableRipple
                onPress={() =>
                  router.push({
                    pathname: '/history/[id]',
                    params: { id: activeWorkdayId },
                  })
                }
              >
                {rowContent}
              </TouchableRipple>
            ) : (
              rowContent
            );
          }}
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
  rowTopLine: { flexDirection: 'row', alignItems: 'baseline' },
  rowTitle: { flex: 1, marginRight: spacing.sm },
  activeBadge: { fontSize: 12, fontWeight: '700' },
  rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
});

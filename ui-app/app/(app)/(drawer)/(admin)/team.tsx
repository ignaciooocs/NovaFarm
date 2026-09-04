import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Dialog,
  HelperText,
  IconButton,
  Portal,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { FindUserResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import { getUsers } from '@/api/generated/users/users';
import { getWorkdays } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore, usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

function roleLabelFor(role: FindUserResponseDto['role']): string {
  if (role === 'admin') {
    return strings.admin.roleAdmin;
  }
  return role === 'supervisor'
    ? strings.admin.roleSupervisor
    : strings.admin.roleRecorder;
}

// Admin y supervisor ven esta pantalla (server-app: GET /users acepta
// 'admin'/'supervisor' vía RolesGuard — la pantalla ya está oculta del
// drawer para un recorder, ver (drawer)/_layout.tsx, esto es la segunda
// capa, real, del lado del server). Cambiar rol (recorder <-> supervisor,
// el ascenso que pidió el usuario 2026-09-04) es admin-only — un supervisor
// que entra acá ve exactamente lo mismo pero de solo lectura, sin el botón
// de cambiar rol, coherente con que su rol es "solo mirar".
export default function TeamScreen() {
  const router = useRouter();
  const palette = usePalette();
  const viewerRole = useAuthStore((state) => state.claims.role);
  const isAdmin = viewerRole === 'admin';
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

  // Confirmar antes de cambiar rol — no es reversible de un toque sin
  // querer como activar/desactivar catálogo, cambia permisos reales.
  const [roleChangeTarget, setRoleChangeTarget] =
    useState<FindUserResponseDto | null>(null);
  const [changingRole, setChangingRole] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

  const nextRoleForTarget =
    roleChangeTarget?.role === 'supervisor' ? 'recorder' : 'supervisor';

  async function handleConfirmRoleChange() {
    if (!roleChangeTarget) {
      return;
    }
    setChangingRole(true);
    setError(null);
    try {
      const { usersControllerUpdateRole } = getUsers();
      await usersControllerUpdateRole(roleChangeTarget._id, {
        role: nextRoleForTarget,
      });
      setRoleChangeTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setChangingRole(false);
    }
  }

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
            const activeWorkdayId = activeWorkdayByRecorder.get(item._id);
            const showRoleToggle = isAdmin && item.role !== 'admin';

            const mainContent = (
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
                      style={[styles.activeBadge, { color: palette.primary }]}
                    >
                      {strings.home.activeWorkday}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.email} · {roleLabelFor(item.role)}
                  {!item.active ? ` · ${strings.common.inactive}` : ''}
                </Text>
              </View>
            );

            // Solo se puede ver (nunca editar) la jornada activa de otra
            // persona, y solo si tiene una — sin jornada activa esa parte
            // de la fila no es tocable, no hay nada que mostrar.
            const tappableMain = activeWorkdayId ? (
              <TouchableRipple
                style={styles.rowTappable}
                onPress={() =>
                  router.push({
                    pathname: '/history/[id]',
                    params: { id: activeWorkdayId },
                  })
                }
              >
                <View style={styles.rowTappableContent}>
                  {mainContent}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={colors.textSecondary}
                  />
                </View>
              </TouchableRipple>
            ) : (
              <View style={[styles.rowTappable, styles.rowTappableContent]}>
                {mainContent}
              </View>
            );

            return (
              <View style={styles.row}>
                {tappableMain}
                {showRoleToggle ? (
                  <IconButton
                    icon={
                      item.role === 'supervisor'
                        ? 'account-arrow-left-outline'
                        : 'account-star-outline'
                    }
                    size={20}
                    accessibilityLabel={
                      item.role === 'supervisor'
                        ? strings.admin.makeRecorder
                        : strings.admin.makeSupervisor
                    }
                    onPress={() => setRoleChangeTarget(item)}
                  />
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Portal>
        <Dialog
          visible={roleChangeTarget !== null}
          onDismiss={() => setRoleChangeTarget(null)}
        >
          <Dialog.Title>{strings.admin.changeRoleTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {roleChangeTarget
                ? strings.admin.changeRoleConfirm(
                    roleChangeTarget.name,
                    roleLabelFor(nextRoleForTarget),
                  )
                : ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRoleChangeTarget(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleConfirmRoleChange}
              loading={changingRole}
            >
              {strings.common.confirm}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTappable: { flex: 1 },
  rowTappableContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowMain: { flex: 1, marginRight: spacing.sm },
  rowTopLine: { flexDirection: 'row', alignItems: 'baseline' },
  rowTitle: { flex: 1, marginRight: spacing.sm },
  activeBadge: { fontSize: 12, fontWeight: '700' },
  rowSubtitle: { color: colors.textSecondary, marginTop: 2 },
});

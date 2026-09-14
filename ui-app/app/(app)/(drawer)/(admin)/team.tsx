import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Dialog,
  HelperText,
  IconButton,
  Portal,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { FindUserResponseDto } from '@/api/generated/novaFarmAPI.schemas';
import {
  usersControllerFindAll,
  usersControllerUpdateRoles,
} from '@/api/generated/users/users';
import { workdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useCapabilities } from '@/lib/permissions';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

type AssignableRole = 'recorder' | 'supervisor';
const ASSIGNABLE_ROLES: AssignableRole[] = ['recorder', 'supervisor'];

function roleLabelFor(role: FindUserResponseDto['roles'][number]): string {
  if (role === 'admin') {
    return strings.admin.roleAdmin;
  }
  return role === 'supervisor'
    ? strings.admin.roleSupervisor
    : strings.admin.roleRecorder;
}

function rolesLabelFor(roles: FindUserResponseDto['roles']): string {
  return roles.map(roleLabelFor).join(', ');
}

// Admin y supervisor ven esta pantalla (server-app: GET /users acepta
// 'admin'/'supervisor' vía RolesGuard — la pantalla ya está oculta del
// drawer para un recorder puro, ver (drawer)/_layout.tsx, esto es la
// segunda capa, real, del lado del server). Editar roles (sistema multirol,
// 2026-09-04, ver ui-arquitectura.md §5) es admin-only — un supervisor que
// entra acá ve exactamente lo mismo pero de solo lectura, sin el botón de
// editar roles, coherente con que su rol es "solo mirar". Un admin puede
// editar la fila de cualquiera, incluida la suya propia o la de otro admin
// — nunca se puede quitar/otorgar el rol admin en sí (ver
// UpdateUserRolesRequestDto del lado del server), solo agregar/quitar
// recorder/supervisor encima (caso "admin que también anota").
export default function TeamScreen() {
  const router = useRouter();
  const palette = usePalette();
  const canManageTeamRoles = useCapabilities().canManageTeamRoles;
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

  // Reemplazo completo del array de roles (el admin manda el set final
  // deseado) — checkboxes en vez del toggle binario recorder<->supervisor
  // de antes, ahora que una cuenta puede tener ambos a la vez.
  const [rolesEditTarget, setRolesEditTarget] =
    useState<FindUserResponseDto | null>(null);
  const [editRoles, setEditRoles] = useState<Set<AssignableRole>>(new Set());
  const [savingRoles, setSavingRoles] = useState(false);

  async function load() {
    setLoading(true);
    try {
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

  function openRolesEditor(user: FindUserResponseDto) {
    setRolesEditTarget(user);
    setEditRoles(
      new Set(
        user.roles.filter(
          (role): role is AssignableRole => role !== 'admin',
        ),
      ),
    );
  }

  function toggleEditRole(role: AssignableRole) {
    setEditRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }

  async function handleConfirmRoles() {
    if (!rolesEditTarget) {
      return;
    }
    const isAdminTarget = rolesEditTarget.roles.includes('admin');
    if (!isAdminTarget && editRoles.size === 0) {
      return;
    }
    setSavingRoles(true);
    setError(null);
    try {
      await usersControllerUpdateRoles(rolesEditTarget._id, {
        roles: Array.from(editRoles),
      });
      setRolesEditTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingRoles(false);
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
            const showRolesButton = canManageTeamRoles;

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
                  {item.email} · {rolesLabelFor(item.roles)}
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
                {showRolesButton ? (
                  <IconButton
                    icon="account-cog-outline"
                    size={20}
                    accessibilityLabel={strings.admin.manageRoles}
                    onPress={() => openRolesEditor(item)}
                  />
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Portal>
        <Dialog
          visible={rolesEditTarget !== null}
          onDismiss={() => setRolesEditTarget(null)}
        >
          <Dialog.Title>
            {rolesEditTarget ? strings.admin.manageRolesTitle(rolesEditTarget.name) : ''}
          </Dialog.Title>
          <Dialog.Content>
            {rolesEditTarget?.roles.includes('admin') ? (
              <HelperText type="info">
                {strings.admin.manageRolesAdminNote}
              </HelperText>
            ) : null}
            {ASSIGNABLE_ROLES.map((role) => (
              <Checkbox.Item
                key={role}
                label={roleLabelFor(role)}
                status={editRoles.has(role) ? 'checked' : 'unchecked'}
                onPress={() => toggleEditRole(role)}
              />
            ))}
            {editRoles.size === 0 && !rolesEditTarget?.roles.includes('admin') ? (
              <HelperText type="error">
                {strings.admin.manageRolesEmpty}
              </HelperText>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRolesEditTarget(null)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleConfirmRoles}
              loading={savingRoles}
              disabled={
                editRoles.size === 0 &&
                !rolesEditTarget?.roles.includes('admin')
              }
            >
              {strings.common.save}
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

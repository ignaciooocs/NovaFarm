import { useMemo, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import {
  getUsersControllerFindAllQueryKey,
  getUsersControllerFindMeQueryKey,
  useUsersControllerFindAll,
  useUsersControllerUpdateRoles,
} from '@/api/generated/users/users';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useCapabilities } from '@/lib/permissions';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

const OPEN_WORKDAYS = { status: 'OPEN' } as const;

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
  const queryClient = useQueryClient();

  // Antes se pedía solo al montar, y como las pantallas del drawer quedan
  // montadas, volver acá mostraba datos viejos (ej. sin el "Jornada activa"
  // de alguien que acababa de abrir). Ahora se refresca en cada foco, con lo
  // último visible mientras tanto.
  const usersQuery = useUsersControllerFindAll();
  const openWorkdaysQuery = useWorkdaysControllerFindAll(OPEN_WORKDAYS);
  useRefreshOnFocus([usersQuery.queryKey, openWorkdaysQuery.queryKey]);

  // _id de la jornada abierta de cada recorder, si tiene una ahora mismo —
  // resuelto vía GET /workdays?status=OPEN (mismo endpoint que usa Home,
  // y con la misma query key, así que comparten caché) en vez de agregar un
  // campo nuevo a /users. El id sirve para poder tocar la fila y ver esa
  // jornada (history/[id].tsx, que ya sabe mostrar tanto jornadas cerradas
  // como abiertas). Jornadas en modo invitado (recorderId null) no marcan a
  // nadie, a propósito — no hay a quién atribuírselas.
  const activeWorkdayByRecorder = useMemo(
    () =>
      new Map(
        (openWorkdaysQuery.data ?? [])
          .filter((workday) => workday.recorderId)
          .map((workday) => [workday.recorderId as string, workday._id]),
      ),
    [openWorkdaysQuery.data],
  );

  // Reemplazo completo del array de roles (el admin manda el set final
  // deseado) — checkboxes en vez del toggle binario recorder<->supervisor
  // de antes, ahora que una cuenta puede tener ambos a la vez.
  const [rolesEditTarget, setRolesEditTarget] =
    useState<FindUserResponseDto | null>(null);
  const [editRoles, setEditRoles] = useState<Set<AssignableRole>>(new Set());

  const updateRoles = useUsersControllerUpdateRoles({
    mutation: {
      onSuccess: () => {
        setRolesEditTarget(null);
        // Las dos: /users es esta lista, y /users/me cambia si el admin se
        // editó a sí mismo (caso "admin que también anota"). No comparten
        // prefijo — las keys se comparan por elemento, no como texto.
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindAllQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindMeQueryKey(),
        });
      },
    },
  });

  const error = updateRoles.error ?? usersQuery.error ?? openWorkdaysQuery.error;

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

  function handleConfirmRoles() {
    if (!rolesEditTarget) {
      return;
    }
    const isAdminTarget = rolesEditTarget.roles.includes('admin');
    if (!isAdminTarget && editRoles.size === 0) {
      return;
    }
    updateRoles.mutate({
      id: rolesEditTarget._id,
      data: { roles: Array.from(editRoles) },
    });
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.admin.teamTitle}
      </Text>

      {error ? (
        <HelperText type="error">{getErrorMessage(error)}</HelperText>
      ) : null}

      {/* Espera las dos, igual que antes: sin la de jornadas, la lista
          aparecería y las marcas de "Jornada activa" saltarían un instante
          después. Solo la primera vez — después hay caché. */}
      {usersQuery.isPending || openWorkdaysQuery.isPending ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={usersQuery.data ?? []}
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
              loading={updateRoles.isPending}
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

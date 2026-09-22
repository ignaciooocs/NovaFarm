import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Dialog,
  HelperText,
  Portal,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import {
  getUsersControllerFindAllQueryKey,
  getUsersControllerFindMeQueryKey,
  useUsersControllerFindAll,
  useUsersControllerUpdateRoles,
} from '@/api/generated/users/users';
import { useWorkdaysControllerFindAll } from '@/api/generated/workdays/workdays';
import { LoadError } from '@/components/LoadError';
import { Screen } from '@/components/Screen';
import { DEFAULT_PRODUCT_ICON } from '@/constants/productIcon';
import { strings } from '@/constants/strings';
import { readProductsById, useLocalRead } from '@/lib/localCatalogNames';
import { useCapabilities } from '@/lib/permissions';
import {
  ASSIGNABLE_ROLES,
  roleLabelFor,
  rolesLabelFor,
  type AssignableRole,
} from '@/lib/teamRoles';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { useErrorToast, usePalette } from '@/stores';
import { spacing } from '@/theme';

const OPEN_WORKDAYS = { status: 'OPEN' } as const;

// Detalle de una persona de Mi equipo (pedido del usuario, 2026-09-15): en la
// fila de la lista no cabían nombre, correo, roles, "Jornada activa" y el botón
// de editar en el ancho de un celular. La lista quedó con nombre + roles, y lo
// demás vive acá.
//
// Pantalla y no modal a propósito: tiene acciones adentro — editar roles abre
// su propio diálogo, y la jornada lleva a otra pantalla — y un modal que abre
// otro diálogo encima o navega mientras está abierto se siente torpe. Es el
// mismo patrón que Historial → detalle.
//
// Sin petición propia: no hay GET /users/:id, y tampoco hace falta — los datos
// salen de las mismas queries que Mi equipo ya tiene en caché (misma key), así
// que desde la lista abre al tiro. Admin y supervisor llegan acá (GET /users
// acepta los dos, RolesGuard del lado del server); editar roles es solo del
// admin — nunca se puede otorgar/quitar `admin` en sí, solo agregar/quitar
// recorder/supervisor encima (caso "admin que también anota").
export default function TeamMemberScreen() {
  const { id: memberId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const canManageTeamRoles = useCapabilities().canManageTeamRoles;
  const queryClient = useQueryClient();

  const usersQuery = useUsersControllerFindAll();
  const openWorkdaysQuery = useWorkdaysControllerFindAll(OPEN_WORKDAYS);
  useRefreshOnFocus([usersQuery.queryKey, openWorkdaysQuery.queryKey]);
  const productsById = useLocalRead(readProductsById);

  const member = usersQuery.data?.find((user) => user._id === memberId);
  // Jornadas en modo invitado (recorderId null) no son de nadie, así que
  // nunca calzan acá.
  const activeWorkday = openWorkdaysQuery.data?.find(
    (workday) => workday.recorderId === memberId,
  );
  const activeProduct = activeWorkday
    ? productsById[activeWorkday.productId]
    : undefined;

  // Reemplazo completo del set de roles asignables: el admin marca el set
  // final deseado, y una cuenta puede tener los dos a la vez.
  const [editingRoles, setEditingRoles] = useState(false);
  const [editRoles, setEditRoles] = useState<Set<AssignableRole>>(new Set());

  const updateRoles = useUsersControllerUpdateRoles({
    mutation: {
      onSuccess: () => {
        setEditingRoles(false);
        // Las dos: /users alimenta esta pantalla y la lista, y /users/me
        // cambia si el admin se editó a sí mismo. No comparten prefijo — las
        // keys se comparan por elemento, no como texto.
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindAllQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindMeQueryKey(),
        });
      },
    },
  });

  const isAdminMember = member?.roles.includes('admin') ?? false;
  const error =
    updateRoles.error ?? usersQuery.error ?? openWorkdaysQuery.error;
  useErrorToast(error);

  function openRolesEditor() {
    if (!member) {
      return;
    }
    setEditRoles(
      new Set(
        member.roles.filter((role): role is AssignableRole => role !== 'admin'),
      ),
    );
    setEditingRoles(true);
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
    // A un no-admin el server le exige al menos un rol; a un admin no, porque
    // `admin` se conserva siempre.
    if (!member || (!isAdminMember && editRoles.size === 0)) {
      return;
    }
    updateRoles.mutate({
      id: member._id,
      data: { roles: Array.from(editRoles) },
    });
  }

  // Spinner solo si todavía no hay nada: desde la lista, las dos queries ya
  // están en caché y el detalle abre al tiro. Espera las dos para que la
  // sección de jornada no aparezca de golpe un instante después.
  if (!member && (usersQuery.isPending || openWorkdaysQuery.isPending)) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.admin.teamTitle }}
        />
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!member) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Stack.Screen
          options={{ headerShown: true, title: strings.admin.teamTitle }}
        />
        <LoadError />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, title: member.name }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <Text variant="titleLarge" style={styles.name}>
            {member.name}
          </Text>
          <Text style={styles.email}>{member.email}</Text>
          {!member.active ? (
            <Text style={styles.inactive}>{strings.common.inactive}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>
          {strings.admin.memberRolesSection}
        </Text>
        <View style={styles.rolesRow}>
          <Text style={styles.rolesText}>{rolesLabelFor(member.roles)}</Text>
          {canManageTeamRoles ? (
            <Button
              mode="text"
              onPress={openRolesEditor}
              textColor={palette.primary}
            >
              {strings.admin.manageRoles}
            </Button>
          ) : null}
        </View>

        {activeWorkday ? (
          <>
            <View style={[styles.divider, styles.sectionGap]} />
            <Text style={styles.sectionLabel}>
              {strings.admin.memberWorkdaySection}
            </Text>
            {/* Solo ver, nunca editar la jornada de otra persona, y solo lo
                que ya sincronizó (ver history/[id].tsx). */}
            <TouchableRipple
              onPress={() =>
                router.push({
                  pathname: '/history/[id]',
                  params: { id: activeWorkday._id },
                })
              }
            >
              <View style={styles.workdayRow}>
                <Text style={styles.workdayText} numberOfLines={1}>
                  {activeProduct?.icon ?? DEFAULT_PRODUCT_ICON}{' '}
                  {activeProduct?.name ?? activeWorkday.productId}
                  <Text style={{ color: palette.primary }}>
                    {' · '}
                    {strings.history.openLabel}
                  </Text>
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={palette.textSecondary}
                />
              </View>
            </TouchableRipple>
          </>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={editingRoles} onDismiss={() => setEditingRoles(false)}>
          <Dialog.Title>{strings.admin.manageRolesTitle(member.name)}</Dialog.Title>
          <Dialog.Content>
            {isAdminMember ? (
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
            {editRoles.size === 0 && !isAdminMember ? (
              <HelperText type="error">
                {strings.admin.manageRolesEmpty}
              </HelperText>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditingRoles(false)}>
              {strings.common.cancel}
            </Button>
            <Button
              onPress={handleConfirmRoles}
              loading={updateRoles.isPending}
              disabled={editRoles.size === 0 && !isAdminMember}
            >
              {strings.common.save}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

// Función en vez de StyleSheet.create() estático: la fila de jornada y el
// botón usan el primary del tema activo (usePalette).
function createStyles(colors: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    content: { paddingBottom: spacing.lg },
    headerBlock: { marginBottom: spacing.lg },
    name: { fontWeight: '700' },
    email: { color: colors.textSecondary, marginTop: 2 },
    inactive: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginTop: spacing.xs,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.md,
    },
    sectionGap: { marginTop: spacing.md },
    sectionLabel: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    rolesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rolesText: { flex: 1, color: colors.textPrimary, marginRight: spacing.sm },
    workdayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    workdayText: { flex: 1, color: colors.textPrimary, marginRight: spacing.sm },
  });
}

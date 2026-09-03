import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, HelperText, List, Text } from 'react-native-paper';
import type { FindUserResponseDto } from '@/api/generated/anotaYaAPI.schemas';
import { getUsers } from '@/api/generated/users/users';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

// Solo admin: server-app rechaza GET /users con 403 para un recorder
// (RolesGuard) — la pantalla en sí ya está oculta del drawer para ese rol
// (ver (drawer)/_layout.tsx), esto es la segunda capa, real, del lado del
// server. De momento solo lista (ver el usuario en la lista) — activar/
// desactivar y editar rol quedaron fuera a propósito por ahora.
export default function TeamScreen() {
  const [users, setUsers] = useState<FindUserResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { usersControllerFindAll } = getUsers();
        setUsers(await usersControllerFindAll());
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
            return (
              <List.Item
                title={item.name}
                description={
                  `${item.email} · ${roleLabel}` +
                  (item.active ? '' : ` · ${strings.common.inactive}`)
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
});

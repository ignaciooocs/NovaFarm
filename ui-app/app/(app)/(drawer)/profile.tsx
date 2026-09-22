import { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import {
  getUsersControllerFindAllQueryKey,
  getUsersControllerFindMeQueryKey,
  useUsersControllerFindMe,
  useUsersControllerUpdateMe,
} from '@/api/generated/users/users';
import { LoadError } from '@/components/LoadError';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { rolesLabelFor } from '@/lib/teamRoles';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { useErrorToast } from '@/stores';
import { spacing } from '@/theme';

// Solo perfil propio — editar los roles o desactivar la propia cuenta no
// entra acá (mismos motivos que en UpdateUserRequestDto del lado del
// server: los roles tienen casos límite sin resolver, y active es una
// acción de un admin sobre otra cuenta, no algo que uno se hace a sí mismo).
export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const meQuery = useUsersControllerFindMe();
  useRefreshOnFocus([meQuery.queryKey]);

  // Lo que la persona escribió, o null si todavía no tocó ese campo. Mientras
  // es null, el campo muestra lo del server y sigue sus refrescos; apenas
  // escribe, manda lo escrito y un refresco ya no se lo pisa.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nationalIdDraft, setNationalIdDraft] = useState<string | null>(null);

  const updateMe = useUsersControllerUpdateMe({
    mutation: {
      onSuccess: () => {
        // /users/me alimenta esta pantalla, y /users a Mi equipo, donde
        // también sale el nombre.
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindMeQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getUsersControllerFindAllQueryKey(),
        });
      },
    },
  });

  useErrorToast(meQuery.error);
  useErrorToast(updateMe.error);

  function handleFieldChange(setDraft: (value: string) => void) {
    return (value: string) => {
      setDraft(value);
      // Volver a escribir apaga el "Guardado" y el error del intento
      // anterior. Nunca sobre un guardado en curso: reset() lo desengancha y
      // su onSuccess no correría.
      if (updateMe.isSuccess || updateMe.isError) {
        updateMe.reset();
      }
    };
  }

  if (meQuery.isPending) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const me = meQuery.data;

  // Sin datos no hay formulario. Antes se mostraba vacío con el error, y
  // escribir un nombre y guardar mandaba el RUT vacío como null: borraba el
  // que estaba guardado. La query se vuelve a pedir sola al reconectar o al
  // volver a la pantalla.
  if (!me) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <Text variant="headlineMedium" style={styles.title}>
          {strings.profile.title}
        </Text>
        <LoadError />
      </Screen>
    );
  }

  const name = nameDraft ?? me.name;
  const nationalId = nationalIdDraft ?? me.nationalId ?? '';

  // nationalId vacío se manda como null explícito (no undefined) para
  // borrar uno que ya estaba guardado — ver el comentario en
  // users.service.ts (updateMe) para el motivo ($unset vs $set).
  function handleSave() {
    updateMe.mutate({
      data: { name: name.trim(), nationalId: nationalId.trim() || null },
    });
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.profile.title}
      </Text>

      <Text style={styles.readOnlyRow}>{me.email}</Text>
      <Text style={styles.readOnlyRow}>{rolesLabelFor(me.roles)}</Text>

      <TextInput
        label={strings.common.name}
        value={name}
        onChangeText={handleFieldChange(setNameDraft)}
        style={styles.input}
      />
      <TextInput
        label={strings.profile.nationalIdLabel}
        value={nationalId}
        onChangeText={handleFieldChange(setNationalIdDraft)}
        style={styles.input}
      />

      {updateMe.isSuccess ? (
        <HelperText type="info">{strings.profile.saved}</HelperText>
      ) : null}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={updateMe.isPending}
        disabled={!name.trim() || updateMe.isPending}
      >
        {strings.common.save}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  readOnlyRow: { marginBottom: spacing.xs },
  input: { marginTop: spacing.md, marginBottom: spacing.sm },
});

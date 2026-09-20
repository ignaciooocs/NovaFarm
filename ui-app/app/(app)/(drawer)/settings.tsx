import { useEffect, useReducer, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Button,
  Divider,
  HelperText,
  IconButton,
  Switch,
  Text,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import {
  getFarmsControllerFindMeQueryKey,
  useFarmsControllerFindMe,
  useFarmsControllerRegenerateInvitationCode,
  useFarmsControllerUpdateMe,
} from '@/api/generated/farms/farms';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useCapabilities } from '@/lib/permissions';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { useFarmSettingsStore, usePalette, useThemeStore } from '@/stores';
import { colors, palettes, spacing, type PaletteName } from '@/theme';

const PALETTE_NAMES = Object.keys(palettes) as PaletteName[];

export default function SettingsScreen() {
  const canManageFarmSettings = useCapabilities().canManageFarmSettings;
  const activePalette = useThemeStore((state) => state.palette);
  const setPalette = useThemeStore((state) => state.setPalette);
  const palette = usePalette();
  const queryClient = useQueryClient();

  const farmQuery = useFarmsControllerFindMe();
  useRefreshOnFocus([farmQuery.queryKey]);
  const farm = farmQuery.data;
  const [copied, setCopied] = useState(false);

  // Solo quien puede administrar la farm ve el switch (ver el render de
  // abajo) — server-app igual lo vuelve a exigir vía RolesGuard en
  // PATCH /farms/me.
  const updateFarm = useFarmsControllerUpdateMe({
    mutation: {
      // Un refresco que ya iba en camino podría llegar después del guardado
      // con el valor viejo y devolver el switch atrás.
      onMutate: () =>
        queryClient.cancelQueries({
          queryKey: getFarmsControllerFindMeQueryKey(),
        }),
      onSuccess: (updated) => {
        // La respuesta ya es la farm actualizada: se escribe directo en la
        // caché en vez de invalidar. Invalidando, al terminar el guardado el
        // switch volvería un instante al valor viejo hasta que llegue el
        // refresco.
        queryClient.setQueryData(getFarmsControllerFindMeQueryKey(), updated);
        // Y en la copia local que decide si el menú muestra los catálogos
        // (lib/farmSettings.ts): antes quedaba vieja hasta pasar por Inicio,
        // y se notaba al cambiar de modo a Anotador.
        useFarmSettingsStore.setState({
          recordersCanManageCatalog: updated.recordersCanManageCatalog,
        });
      },
    },
  });

  function handleToggle(value: boolean) {
    updateFarm.mutate({ data: { recordersCanManageCatalog: value } });
  }

  // El código de invitación vence una hora después de generarse. Solo quien
  // administra la farm ve el botón para generar otro; server-app lo exige
  // igual (RolesGuard en POST /farms/me/invitation-code).
  const codeExpired = useIsPast(farm?.invitationCodeExpiresAt ?? null);
  const regenerateCode = useFarmsControllerRegenerateInvitationCode({
    mutation: {
      // Mismo motivo que en updateFarm: un refresco en camino llegaría con
      // el código vencido encima del nuevo.
      onMutate: () =>
        queryClient.cancelQueries({
          queryKey: getFarmsControllerFindMeQueryKey(),
        }),
      // La respuesta ya es la farm con el código nuevo.
      onSuccess: (updated) =>
        queryClient.setQueryData(getFarmsControllerFindMeQueryKey(), updated),
    },
  });

  async function handleCopyCode(invitationCode: string) {
    await Clipboard.setStringAsync(invitationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareCode(invitationCode: string) {
    try {
      await Share.share({
        message: strings.onboarding.shareMessage(invitationCode),
      });
    } catch {
      // Usuario canceló el share sheet — no es un error real, mismo
      // criterio que invite-code.tsx.
    }
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.settings.title}
      </Text>

      <Text variant="titleMedium" style={styles.sectionTitle}>
        {strings.settings.farmInfo}
      </Text>

      {/* Solo la sección de la farm espera a la red: el tema es de este
          dispositivo y se puede cambiar sin señal. Sin datos no se muestra el
          switch — antes salía en su valor por defecto (prendido) aunque la
          farm lo tuviera apagado. */}
      {!farm ? (
        farmQuery.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <HelperText type="error">{getErrorMessage(farmQuery.error)}</HelperText>
        )
      ) : (
        <>
          {/* Un refresco que falla con datos en caché: el aviso va arriba,
              sin tapar lo que ya se tenía. */}
          {farmQuery.error ? (
            <HelperText type="error">
              {getErrorMessage(farmQuery.error)}
            </HelperText>
          ) : null}
          <Text style={styles.row}>{farm.name}</Text>

          <View
            style={[styles.codeCard, { backgroundColor: palette.primarySoft }]}
          >
            <View style={styles.codeTextWrap}>
              <Text style={styles.codeLabel}>
                {strings.onboarding.invitationCodeLabel}
              </Text>
              {/* Vencido no se muestra: copiarlo o compartirlo solo haría
                  que alguien se tope con "caducó" al intentar unirse. */}
              {codeExpired ? (
                <Text variant="titleMedium" style={styles.codeExpired}>
                  {strings.onboarding.invitationCodeExpired}
                </Text>
              ) : (
                <Text
                  variant="titleLarge"
                  style={[styles.codeValue, { color: palette.primary }]}
                >
                  {farm.invitationCode}
                </Text>
              )}
            </View>
            {codeExpired ? null : (
              <>
                <IconButton
                  icon={copied ? 'check' : 'content-copy'}
                  onPress={() => handleCopyCode(farm.invitationCode)}
                  accessibilityLabel={strings.common.copy}
                />
                <IconButton
                  icon="share-variant"
                  onPress={() => handleShareCode(farm.invitationCode)}
                  accessibilityLabel={strings.onboarding.shareButton}
                />
              </>
            )}
          </View>

          {!codeExpired && farm.invitationCodeExpiresAt ? (
            <Text variant="bodySmall" style={styles.codeHint}>
              {strings.onboarding.invitationCodeValidUntil(
                new Date(farm.invitationCodeExpiresAt).toLocaleTimeString(
                  'es-CL',
                  { hour: '2-digit', minute: '2-digit' },
                ),
              )}
            </Text>
          ) : null}
          {codeExpired && canManageFarmSettings ? (
            <Button
              mode="outlined"
              icon="refresh"
              onPress={() => regenerateCode.mutate()}
              loading={regenerateCode.isPending}
              disabled={regenerateCode.isPending}
              textColor={palette.primary}
              style={styles.regenerateButton}
            >
              {strings.onboarding.generateInvitationCode}
            </Button>
          ) : null}
          {codeExpired && !canManageFarmSettings ? (
            <Text variant="bodySmall" style={styles.codeHint}>
              {strings.onboarding.invitationCodeAskAdmin}
            </Text>
          ) : null}
          {regenerateCode.error ? (
            <HelperText type="error">
              {getErrorMessage(regenerateCode.error)}
            </HelperText>
          ) : null}

          {canManageFarmSettings ? (
            <>
              <Divider style={styles.divider} />
              <View style={styles.switchRow}>
                <Text variant="titleMedium" style={styles.switchLabel}>
                  {strings.settings.recordersCanManageCatalog}
                </Text>
                {/* Optimista sin estado propio: mientras guarda muestra lo
                    pedido; al terminar, lo de la caché — que onSuccess ya
                    actualizó, o que sigue con el valor anterior si falló, así
                    que revierte solo. */}
                <Switch
                  value={
                    updateFarm.isPending
                      ? (updateFarm.variables.data.recordersCanManageCatalog ??
                        farm.recordersCanManageCatalog)
                      : farm.recordersCanManageCatalog
                  }
                  onValueChange={handleToggle}
                  disabled={updateFarm.isPending}
                />
              </View>
              <Text variant="bodySmall" style={styles.switchHelp}>
                {strings.settings.recordersCanManageCatalogHelp}
              </Text>
              {updateFarm.error ? (
                <HelperText type="error">
                  {getErrorMessage(updateFarm.error)}
                </HelperText>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <Divider style={styles.divider} />
      <Text variant="titleMedium" style={styles.sectionTitle}>
        {strings.settings.theme}
      </Text>
      <Text variant="bodySmall" style={styles.themeHelp}>
        {strings.settings.themeHelp}
      </Text>
      <View style={styles.paletteRow}>
        {PALETTE_NAMES.map((name) => {
          const selected = name === activePalette;
          return (
            <Pressable
              key={name}
              onPress={() => setPalette(name)}
              style={styles.swatchWrapper}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: palettes[name].primary },
                  selected ? styles.swatchSelected : null,
                ]}
              >
                {selected ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={20}
                    color={colors.surface}
                  />
                ) : null}
              </View>
              <Text style={styles.swatchLabel}>
                {strings.settings.palettes[name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  sectionTitle: { marginBottom: spacing.sm },
  loading: { alignSelf: 'flex-start', marginVertical: spacing.sm },
  row: { marginBottom: spacing.xs },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  codeTextWrap: { flex: 1 },
  codeLabel: { color: colors.textSecondary, fontSize: 12 },
  codeValue: { fontWeight: '800', letterSpacing: 2 },
  codeExpired: { color: colors.textSecondary, paddingVertical: spacing.xs },
  codeHint: { color: colors.textSecondary, marginTop: spacing.xs },
  regenerateButton: { alignSelf: 'flex-start', marginTop: spacing.sm },
  divider: { marginVertical: spacing.lg },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { flex: 1, marginRight: spacing.md },
  switchHelp: { marginTop: spacing.xs },
  themeHelp: { color: colors.textSecondary, marginBottom: spacing.md },
  paletteRow: { flexDirection: 'row', justifyContent: 'space-around' },
  swatchWrapper: { alignItems: 'center' },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
  swatchLabel: { marginTop: spacing.xs, color: colors.textSecondary },
});

// Si la fecha ya pasó (o no hay fecha), y vuelve a renderizar justo cuando
// pasa: sin esto, un código que vence con Ajustes abierto seguiría
// mostrándose como vigente hasta salir y volver a entrar.
function useIsPast(iso: string | null): boolean {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const time = iso === null ? null : new Date(iso).getTime();

  useEffect(() => {
    if (time === null) {
      return;
    }
    const remaining = time - Date.now();
    if (remaining <= 0) {
      return;
    }
    const timer = setTimeout(rerender, remaining);
    return () => clearTimeout(timer);
  }, [time]);

  return time === null || time <= Date.now();
}

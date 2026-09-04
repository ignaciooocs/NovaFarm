import { useMemo } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Text } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

// Sin header propio (ver role.tsx) — la farm ya quedó creada al llegar acá,
// así que "volver" no tiene un significado real (no hay nada que deshacer).
// El siguiente paso (starter-fruits.tsx) también es opcional/omitible, así
// que este flujo sigue completo aunque el usuario nunca comparta el código
// ahora — igual queda disponible después en Ajustes.
export default function InviteCodeScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { code } = useLocalSearchParams<{ code: string }>();

  async function handleShare() {
    try {
      await Share.share({ message: strings.onboarding.shareMessage(code) });
    } catch {
      // Usuario canceló el share sheet, o falló por otro motivo no crítico
      // (ej. sin apps de mensajería instaladas) — el código sigue visible en
      // pantalla igual, no hay nada que mostrarle como error.
    }
  }

  return (
    <Screen>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          name="check-decagram"
          size={48}
          color={palette.primary}
        />
      </View>

      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.invitationCodeTitle}
      </Text>
      <Text style={styles.subtitle}>{strings.onboarding.invitationCodeShare}</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>
          {strings.onboarding.invitationCodeLabel}
        </Text>
        <Text variant="displayMedium" style={styles.code}>
          {code}
        </Text>
      </View>

      <Button
        mode="outlined"
        icon="share-variant"
        onPress={handleShare}
        textColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.shareButton}
      >
        {strings.onboarding.shareButton}
      </Button>

      <Button
        mode="contained"
        onPress={() => router.replace('/starter-fruits')}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.common.continue}
      </Button>
    </Screen>
  );
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    iconWrap: {
      alignItems: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    title: { textAlign: 'center', marginBottom: spacing.xs },
    subtitle: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 16,
      marginBottom: spacing.xl,
    },
    codeCard: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 20,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    codeLabel: { color: colors.textSecondary, marginBottom: spacing.xs },
    code: { letterSpacing: 6, fontWeight: '700', color: palette.primary },
    shareButton: {
      borderRadius: 12,
      marginBottom: spacing.md,
      borderColor: palette.primary,
    },
    buttonContent: { paddingVertical: spacing.xs },
    button: { borderRadius: 12 },
  });
}

import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Divider,
  HelperText,
  IconButton,
  Switch,
  Text,
} from 'react-native-paper';
import {
  farmsControllerFindMe,
  farmsControllerUpdateMe,
} from '@/api/generated/farms/farms';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useCapabilities } from '@/lib/permissions';
import { usePalette, useThemeStore } from '@/stores';
import { colors, palettes, spacing, type PaletteName } from '@/theme';

const PALETTE_NAMES = Object.keys(palettes) as PaletteName[];

export default function SettingsScreen() {
  const canManageFarmSettings = useCapabilities().canManageFarmSettings;
  const activePalette = useThemeStore((state) => state.palette);
  const setPalette = useThemeStore((state) => state.setPalette);
  const palette = usePalette();

  const [farmName, setFarmName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [recordersCanManageCatalog, setRecordersCanManageCatalog] =
    useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const farm = await farmsControllerFindMe();
        setFarmName(farm.name);
        setInvitationCode(farm.invitationCode);
        setRecordersCanManageCatalog(farm.recordersCanManageCatalog);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Optimista: cambia el switch al tiro, revierte si el server rechaza.
  // Solo quien puede administrar la farm ve este control (ver el render de
  // abajo) — server-app igual lo vuelve a exigir vía RolesGuard en
  // PATCH /farms/me.
  async function handleToggle(value: boolean) {
    const previous = recordersCanManageCatalog;
    setRecordersCanManageCatalog(value);
    setSaving(true);
    setError(null);
    try {
      await farmsControllerUpdateMe({ recordersCanManageCatalog: value });
    } catch (err) {
      setRecordersCanManageCatalog(previous);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyCode() {
    await Clipboard.setStringAsync(invitationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareCode() {
    try {
      await Share.share({
        message: strings.onboarding.shareMessage(invitationCode),
      });
    } catch {
      // Usuario canceló el share sheet — no es un error real, mismo
      // criterio que invite-code.tsx.
    }
  }

  if (loading) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.settings.title}
      </Text>

      <Text variant="titleMedium" style={styles.sectionTitle}>
        {strings.settings.farmInfo}
      </Text>
      <Text style={styles.row}>{farmName}</Text>

      <View
        style={[styles.codeCard, { backgroundColor: palette.primarySoft }]}
      >
        <View style={styles.codeTextWrap}>
          <Text style={styles.codeLabel}>
            {strings.onboarding.invitationCodeLabel}
          </Text>
          <Text
            variant="titleLarge"
            style={[styles.codeValue, { color: palette.primary }]}
          >
            {invitationCode}
          </Text>
        </View>
        <IconButton
          icon={copied ? 'check' : 'content-copy'}
          onPress={handleCopyCode}
          accessibilityLabel={strings.common.copy}
        />
        <IconButton
          icon="share-variant"
          onPress={handleShareCode}
          accessibilityLabel={strings.onboarding.shareButton}
        />
      </View>

      {canManageFarmSettings ? (
        <>
          <Divider style={styles.divider} />
          <View style={styles.switchRow}>
            <Text variant="titleMedium" style={styles.switchLabel}>
              {strings.settings.recordersCanManageCatalog}
            </Text>
            <Switch
              value={recordersCanManageCatalog}
              onValueChange={handleToggle}
              disabled={saving}
            />
          </View>
          <Text variant="bodySmall" style={styles.switchHelp}>
            {strings.settings.recordersCanManageCatalogHelp}
          </Text>
        </>
      ) : null}

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

      {error ? <HelperText type="error">{error}</HelperText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  sectionTitle: { marginBottom: spacing.sm },
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

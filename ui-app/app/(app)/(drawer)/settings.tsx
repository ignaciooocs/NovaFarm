import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Divider,
  HelperText,
  Switch,
  Text,
} from 'react-native-paper';
import { getFarms } from '@/api/generated/farms/farms';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore, useThemeStore } from '@/stores';
import { colors, palettes, spacing, type PaletteName } from '@/theme';

const PALETTE_NAMES = Object.keys(palettes) as PaletteName[];

export default function SettingsScreen() {
  const isAdmin = useAuthStore((state) => state.claims.role) === 'admin';
  const activePalette = useThemeStore((state) => state.palette);
  const setPalette = useThemeStore((state) => state.setPalette);

  const [farmName, setFarmName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [recordersCanManageCatalog, setRecordersCanManageCatalog] =
    useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { farmsControllerFindMe } = getFarms();
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
  // Solo admin ve este control (ver el render de abajo) — server-app igual
  // lo vuelve a exigir vía RolesGuard en PATCH /farms/me.
  async function handleToggle(value: boolean) {
    const previous = recordersCanManageCatalog;
    setRecordersCanManageCatalog(value);
    setSaving(true);
    setError(null);
    try {
      const { farmsControllerUpdateMe } = getFarms();
      await farmsControllerUpdateMe({ recordersCanManageCatalog: value });
    } catch (err) {
      setRecordersCanManageCatalog(previous);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
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
      <Text style={styles.row}>
        {strings.onboarding.invitationCodeLabel}: {invitationCode}
      </Text>

      {isAdmin ? (
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

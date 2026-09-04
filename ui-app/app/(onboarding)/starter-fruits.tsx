import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, HelperText, Text, TouchableRipple } from 'react-native-paper';
import { getFruits } from '@/api/generated/fruits/fruits';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { SUGGESTED_FRUITS } from '@/constants/suggestedFruits';
import { getErrorMessage } from '@/lib/errors';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

// Lista de sugerencias compartida con fruits.tsx (ver
// constants/suggestedFruits.ts) — acá no es un catálogo real todavía, se
// crean recién al confirmar (POST /fruits, una llamada por fruta elegida;
// no hay variante bulk en server-app y con máximo 6 ítems no vale la pena
// agregar una solo para esto, mismo criterio que la paginación de
// harvesters pospuesta).

// Último paso, opcional, del onboarding del admin — nunca lo ve un recorder
// que se une a un equipo existente (join-farm.tsx sigue yendo directo a
// /home, ese catálogo ya lo armó el admin del equipo al que se une). Mismo
// lenguaje visual que fruits.tsx (grilla 2 columnas, tile cuadrado, emoji al
// centro) pero de selección múltiple en vez de editar/activar — acá nada
// está creado todavía, tocar un tile solo lo marca para crear al confirmar.
// Sin header propio, igual que invite-code.tsx: no hay "volver" con sentido
// en un paso posterior a que la farm ya se creó.
export default function StarterFruitsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleContinue() {
    setError(null);
    setSaving(true);
    try {
      const { fruitsControllerCreate } = getFruits();
      const toCreate = SUGGESTED_FRUITS.filter((fruit) =>
        selected.has(fruit.name),
      );
      await Promise.all(
        toCreate.map((fruit) =>
          fruitsControllerCreate({ name: fruit.name, icon: fruit.icon }),
        ),
      );
      router.replace('/home');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.onboarding.starterFruitsTitle}
      </Text>
      <Text style={styles.subtitle}>
        {strings.onboarding.starterFruitsSubtitle}
      </Text>

      <View style={styles.grid}>
        {SUGGESTED_FRUITS.map((fruit) => {
          const isSelected = selected.has(fruit.name);
          return (
            <TouchableRipple
              key={fruit.name}
              onPress={() => toggle(fruit.name)}
              style={[styles.tile, isSelected && styles.tileSelected]}
            >
              <View style={styles.tileBody}>
                <Text style={styles.tileEmoji}>{fruit.icon}</Text>
                <Text style={styles.tileName}>{fruit.name}</Text>
                {isSelected ? (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={palette.primary}
                    style={styles.tileCheck}
                  />
                ) : null}
              </View>
            </TouchableRipple>
          );
        })}
      </View>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleContinue}
        loading={saving}
        disabled={selected.size === 0 || saving}
        buttonColor={palette.primary}
        contentStyle={styles.buttonContent}
        style={styles.button}
      >
        {strings.onboarding.starterFruitsAddButton}
      </Button>
      <Button
        mode="text"
        onPress={() => router.replace('/home')}
        disabled={saving}
        textColor={colors.textSecondary}
      >
        {strings.common.skip}
      </Button>
    </Screen>
  );
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    title: { marginBottom: spacing.xs },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      marginBottom: spacing.lg,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
    tile: {
      width: '44%',
      aspectRatio: 1,
      marginBottom: spacing.lg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tileSelected: {
      backgroundColor: palette.primarySoft,
      borderColor: palette.primary,
    },
    tileBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    tileEmoji: { fontSize: 40, marginBottom: spacing.xs },
    tileName: { fontWeight: 'bold', textAlign: 'center' },
    tileCheck: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    buttonContent: { paddingVertical: spacing.xs },
    button: { borderRadius: 12, marginTop: spacing.sm },
  });
}

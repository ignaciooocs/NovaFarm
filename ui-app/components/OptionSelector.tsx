import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, TouchableRipple } from 'react-native-paper';
import { usePalette } from '@/stores';
import { colors, spacing } from '@/theme';

export interface SelectableOption<T extends string> {
  value: T;
  // Título corto — lo que se lee de un vistazo en la fila.
  short: string;
  // Texto completo, debajo del título — acá va la frase larga que antes no
  // entraba en un control de ancho fijo (ej. SegmentedButtons).
  description: string;
}

interface OptionSelectorProps<T extends string> {
  options: SelectableOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

// Grupo de opciones excluyentes, cada una de ancho completo (título +
// descripción larga + radio a la derecha) en vez de un SegmentedButtons de N
// columnas — nace de que "Organización"/"Independiente" en create-farm.tsx
// no entraban legibles en dos columnas de la mitad del ancho de pantalla
// cada una. Reusado también en role.tsx (mismo problema, mismo motivo).
export function OptionSelector<T extends string>({
  options,
  value,
  onChange,
  style,
}: OptionSelectorProps<T>) {
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={[styles.group, style]}>
      {options.map((option, index) => {
        const selected = value === option.value;
        return (
          <TouchableRipple
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.row,
              index < options.length - 1 && styles.rowDivider,
              selected && styles.rowSelected,
            ]}
          >
            <View style={styles.content}>
              <View style={styles.text}>
                <Text
                  variant="titleSmall"
                  style={selected ? styles.shortSelected : undefined}
                >
                  {option.short}
                </Text>
                <Text variant="bodySmall" style={styles.description}>
                  {option.description}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={selected ? palette.primary : palette.textSecondary}
              />
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

function createStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    group: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowSelected: { backgroundColor: palette.primarySoft },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    text: { flex: 1, marginRight: spacing.sm },
    shortSelected: { color: palette.primary, fontWeight: '700' },
    description: { color: colors.textSecondary, marginTop: 2 },
  });
}

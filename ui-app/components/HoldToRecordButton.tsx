import { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from 'react-native-paper';
import { strings } from '@/constants/strings';
import { usePalette } from '@/stores';
import { spacing, TOUCH_TARGET_MIN } from '@/theme';

// Cuánto hay que mantener apretado para anotar. Empezó en 1 segundo (lo que
// pidió el usuario) y probándolo se sintió largo para la acción más repetida
// del día: pasó a 0,75 s y el usuario lo dejó en 0,4 s (2026-09-16). Sigue
// siendo claramente más que un toque. Si en terreno se siente lento o
// apurado, se ajusta acá.
export const HOLD_TO_RECORD_MS = 400;

interface HoldToRecordButtonProps {
  label: string;
  variant: 'contained' | 'outlined';
  // Se cumplió el tiempo con el dedo todavía encima: anotar.
  onComplete: () => void;
  // Se soltó antes de tiempo (un toque rápido), para avisar que hay que
  // mantener. No se llama si el gesto lo cancela el scroll de la lista ni si
  // el dedo se desliza fuera del botón.
  onReleasedEarly: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botón de anotar que exige mantenerlo apretado, con una barra que se llena
 * mientras tanto.
 *
 * Pedido del usuario (docs/issues.md, 2026-09-16): con un toque rápido el
 * anotador no sabía si de verdad anotó o si tocó al lado, y en la duda podía
 * apretar de nuevo y sumarle envases de más al cosechador. Mantener apretado
 * hace que anotar sea deliberado, y la barra muestra cuánto falta. La
 * confirmación de que sí anotó (vibración, salto del número, aviso con
 * Deshacer) la da el Anotador, no este botón.
 *
 * Un apretón = una anotación: mantenerlo más tiempo no vuelve a anotar.
 */
export function HoldToRecordButton({
  label,
  variant,
  onComplete,
  onReleasedEarly,
  style,
}: HoldToRecordButtonProps) {
  const palette = usePalette();
  const progress = useRef(new Animated.Value(0)).current;
  // Si este apretón ya anotó, para no avisar "mantén apretado" al soltar.
  const completedRef = useRef(false);

  function handlePressIn() {
    completedRef.current = false;
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_TO_RECORD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // finished es false si se soltó (stopAnimation en handlePressOut).
      if (finished) {
        completedRef.current = true;
        onComplete();
      }
    });
  }

  function handlePressOut() {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }

  // onPress solo llega si se soltó encima del botón, nunca si el scroll de
  // la lista tomó el gesto — justo lo que se quiere para el aviso.
  function handlePress() {
    if (!completedRef.current) {
      onReleasedEarly();
    }
  }

  const contained = variant === 'contained';

  // Sin crecer al mantener: se probó (5%, 2026-09-16) y al usuario no le
  // gustó. La barra sola alcanza.
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={strings.anotador.holdToRecordHint}
      style={[
        styles.button,
        contained
          ? { backgroundColor: palette.primary }
          : { borderWidth: 1, borderColor: palette.border },
        style,
      ]}
    >
      {/* scaleX desde la izquierda en vez de animar el ancho: el transform
          corre en el hilo nativo, así que la barra avanza pareja aunque JS
          esté ocupado. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          contained
            ? { backgroundColor: palette.primaryDark }
            : { backgroundColor: palette.primary, opacity: 0.25 },
          { transformOrigin: 'left', transform: [{ scaleX: progress }] },
        ]}
      />
      <Text
        variant="labelLarge"
        style={[
          styles.label,
          { color: contained ? palette.surface : palette.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Mismo radio y alto mínimo que los Button de Paper que reemplaza, para
  // que la fila de botones se vea igual que antes.
  button: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  label: { fontWeight: '700' },
});

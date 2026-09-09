import type { ComponentProps } from 'react';
import { useWindowDimensions } from 'react-native';
import { Dialog } from 'react-native-paper';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { spacing } from '@/theme';

// Aire entre el borde de arriba de la pantalla (ya descontada el área
// segura, ver abajo) y la tarjeta.
const TOP_MARGIN = spacing.xl;

// Piso del alto del diálogo — alcanza para el título, un campo y los botones.
// Existe solo para que un cálculo raro (una pantalla diminuta, un teclado
// enorme) nunca deje un diálogo inusable de 20px.
const MIN_DIALOG_HEIGHT = 240;

type KeyboardAwareDialogProps = ComponentProps<typeof Dialog>;

/**
 * El `Dialog` de Paper, pero que no se deja tapar por el teclado.
 *
 * Úsalo en todo diálogo que tenga un campo de texto adentro; para uno de
 * puro texto y botones (confirmar, avisar) el `Dialog` pelado está bien,
 * porque ahí nunca sube el teclado.
 *
 * **Por qué hace falta**: en Android la ventana se achica sola cuando sube el
 * teclado (`softwareKeyboardLayoutMode` "resize", el default de Expo) y todo
 * lo que está centrado se reacomoda. iOS no cambia el tamaño de la ventana —
 * dibuja el teclado encima — así que el diálogo sigue centrado en la pantalla
 * completa y su mitad de abajo, botones incluidos, queda debajo del teclado.
 *
 * **Cómo lo resuelve**: dos cosas, y las dos van al `style` del `Dialog`, que
 * Paper aplica al `Surface` (la tarjeta) dentro de un wrapper con
 * `justifyContent: 'center'`. Ese wrapper ya viene descontado por el área
 * segura, así que el margen de acá se mide desde abajo del notch.
 *
 * - `marginBottom: 'auto'` **ancla la tarjeta arriba en vez de centrarla**.
 *   Un margen `auto` se come el espacio libre del eje principal y le gana al
 *   `justifyContent` del wrapper. Anclada arriba, una tarjeta corta ni se
 *   acerca al teclado — vale incluso si por lo que sea no llegara a leerse su
 *   altura, que es el punto: no depende de que el evento del teclado llegue.
 * - `maxHeight` = lo que queda arriba del teclado, para el caso en que el
 *   formulario sí sea largo. En RN el `flexShrink` por defecto es 0, así que
 *   sin el techo el `Surface` no se achica y se desbordaría igual. Con el
 *   techo puesto, un `Dialog.ScrollArea` adentro (que ya trae
 *   `flexShrink: 1`) absorbe la diferencia y el contenido se scrollea.
 *
 * **Lo que NO funciona** (ya se intentó, no lo reintentes): envolver el
 * `Dialog` en un `KeyboardAvoidingView`. El KAV se aplica un `paddingBottom`
 * a sí mismo, y en Yoga el padding del padre no reposiciona a un hijo con
 * `absoluteFill` — que es exactamente lo que es el wrapper del `Modal` de
 * Paper. El padding queda puesto y no mueve nada.
 */
export function KeyboardAwareDialog({
  style,
  ...props
}: KeyboardAwareDialogProps) {
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(
    MIN_DIALOG_HEIGHT,
    windowHeight - keyboardHeight - TOP_MARGIN - spacing.xl,
  );

  return (
    <Dialog
      {...props}
      style={[
        { marginTop: TOP_MARGIN, marginBottom: 'auto', maxHeight },
        style,
      ]}
    />
  );
}

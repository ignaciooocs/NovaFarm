import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Alto que ocupa el teclado en pantalla, o 0 si está abajo.
 *
 * **En las dos plataformas el teclado se dibuja encima de la app sin achicar
 * la ventana**, así que esquivarlo queda de cuenta de cada pantalla. En iOS
 * siempre fue así. En Android este hook devolvía 0 a propósito, asumiendo
 * que la ventana se achicaba sola (`softwareKeyboardLayoutMode` "resize", el
 * default de Expo) — pero con edge-to-edge, que Expo deja siempre prendido,
 * eso ya no pasa: probado en un Android con Expo Go el 2026-09-16, el teclado
 * tapaba el final de la lista de "Agregar cosechador" por más scroll que se
 * hiciera. En Android el alto que manda React Native ya viene descontada la
 * barra de navegación.
 *
 * En iOS escucha los eventos `Will*` (que emite antes de animar), para que lo
 * que se mueva acompañe la animación del teclado en vez de saltar de golpe
 * cuando ya terminó. Android solo emite los `Did*`.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const [showEvent, hideEvent] =
      Platform.OS === 'ios'
        ? (['keyboardWillShow', 'keyboardWillHide'] as const)
        : (['keyboardDidShow', 'keyboardDidHide'] as const);

    const show = Keyboard.addListener(showEvent, (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

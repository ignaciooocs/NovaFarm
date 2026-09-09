import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Alto que ocupa el teclado en pantalla, o 0 si está abajo.
 *
 * **Devuelve 0 fijo en Android, a propósito**: allá la ventana se achica
 * sola cuando sube el teclado (`softwareKeyboardLayoutMode` "resize", el
 * default de Expo), así que cualquier cosa centrada ya se reacomoda por su
 * cuenta y descontar el teclado a mano encima lo contaría dos veces. En iOS
 * la ventana no cambia de tamaño — el teclado se dibuja arriba de la app —
 * y esquivarlo queda de cuenta de cada pantalla.
 *
 * Escucha los eventos `Will*` (que iOS emite antes de animar) en vez de los
 * `Did*`, para que lo que se mueva acompañe la animación del teclado en vez
 * de saltar de golpe cuando ya terminó.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

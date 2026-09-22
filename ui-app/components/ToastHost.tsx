import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { hideToast, useToastStore } from '@/stores';

// Alto de la tab bar (sin el área segura de abajo, que se suma aparte):
// TABBAR_HEIGHT_UIKIT en la implementación de expo-router, que no la exporta.
// Este componente vive fuera del navegador de tabs, así que tampoco puede
// preguntarla con useBottomTabBarHeight.
const TAB_BAR_HEIGHT = 49;

// El único Snackbar de la app, montado en la raíz (app/_layout.tsx) y no
// dentro de cada pantalla: así el aviso se ve igual en todas, sobrevive a un
// router.replace() y no hay dos avisos peleando por el mismo borde de abajo.
// Queda debajo de los diálogos a propósito — Paper monta los Portal después
// de este, y un error de un campo tiene que verse sobre su propio diálogo.
export function ToastHost() {
  const toast = useToastStore((state) => state.toast);
  const visible = useToastStore((state) => state.visible);
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // El aviso se dibuja sobre el navegador entero, así que acá no hay forma de
  // saber si la pantalla de abajo tiene tab bar salvo mirando la ruta.
  // `string[]` explícito: useSegments() devuelve la unión de rutas conocidas
  // y sobre ese tipo includes() no acepta nada.
  const segments: string[] = useSegments();
  const onTabs = segments.includes('(tabs)');

  // Por defecto Paper lo pega al borde de abajo, donde el teclado lo tapa
  // entero (se dibuja encima de la app en las dos plataformas, ver
  // useKeyboardHeight) y donde en Inicio/Historial cae sobre la tab bar. Con
  // el teclado arriba manda el teclado y nada más: la tab bar ya quedó
  // tapada por él de todos modos. En Android el alto del teclado viene sin
  // la barra de navegación, así que hay que sumarla para no quedar detrás.
  const bottom =
    keyboardHeight > 0
      ? keyboardHeight + (Platform.OS === 'android' ? insets.bottom : 0)
      : (onTabs ? TAB_BAR_HEIGHT : 0) + insets.bottom;

  if (!toast) {
    return null;
  }

  return (
    <Snackbar
      key={toast.id}
      visible={visible}
      onDismiss={() => hideToast()}
      duration={toast.duration}
      action={toast.action}
      // paddingBottom en 0: el área segura ya va en `bottom`, y si no se
      // pisa el de Paper el aviso queda flotando un pulgar más arriba de lo
      // pedido.
      wrapperStyle={{ bottom, paddingBottom: 0 }}
    >
      {toast.message}
    </Snackbar>
  );
}

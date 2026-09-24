import { AppState, Platform } from 'react-native';
import {
  focusManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
// Directo al archivo y no a '@/stores': stores/index.ts reexporta
// useAuthStore, y si algún día un store necesitara este archivo quedaría un
// import circular que en Metro llega como undefined al arrancar.
import { useAuthStore } from '@/stores/useAuthStore';
import { useConnectivityStore } from '@/stores/useConnectivityStore';

// Solo para datos del server que se muestran en pantalla. Lo que alimenta
// SQLite y el sync de cuatro etapas no pasa por acá, a propósito — ver
// "React Query" en docs/diagrams/ui-arquitectura.md antes de sumar una
// query nueva.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // En el modo por defecto ('online') una query sin señal no falla: se
      // queda pendiente y pausada, o sea un spinner que no termina nunca.
      // offlineFirst intenta una vez y, sin reintentos, cae en error — lo
      // mismo que hace hoy cada pantalla —, y aun así se vuelve a pedir sola
      // al reconectar.
      networkMode: 'offlineFirst',
      // Ninguna pantalla reintentaba antes de esto, y con el timeout de 15s
      // de axios-instance.ts cada reintento serían 15s más mirando un
      // spinner en terreno. Se vuelve a pedir al enfocar la pantalla.
      retry: false,
    },
    mutations: {
      // Sin esto, una mutación sin señal se pausa y se dispara sola al
      // volver la conexión: una escritura del usuario saliendo cuando nadie
      // la está mirando, justo lo que la app evita (el sync es un botón
      // explícito). 'always' falla al tiro y la pantalla muestra el error.
      networkMode: 'always',
      // Nunca reintentar escrituras: un create que llegó al server pero
      // cuya respuesta se perdió quedaría duplicado.
      retry: false,
    },
  },
});

// Se llama una sola vez desde app/_layout.tsx, junto a los otros bootstrap*.
// React Query trae de fábrica lo que en la web hace el navegador (saber si
// hay red, saber si la pestaña está al frente); en React Native hay que
// dárselo.
export function bootstrapQueryManagers(): () => void {
  // La misma fuente de conectividad que el indicador de RF-04.2 y los
  // reintentos de catálogo, no un segundo listener de NetInfo que pudiera
  // opinar distinto.
  onlineManager.setEventListener((setOnline) => {
    setOnline(useConnectivityStore.getState().isConnected);
    return useConnectivityStore.subscribe((state) => {
      setOnline(state.isConnected);
    });
  });

  // Al volver la app al frente, las queries de las pantallas montadas se
  // refrescan (refetchOnWindowFocus). En web eso ya lo resuelve el
  // navegador.
  const appStateSubscription = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') {
      focusManager.setFocused(status === 'active');
    }
  });

  // La caché es de una cuenta: sin esto, cerrar sesión y entrar con otra
  // mostraría el equipo o el historial de la anterior hasta que cada
  // pantalla termine de pedir de nuevo — mismo tipo de bug que la jornada
  // activa compartida entre cuentas (createdByUid). Se engancha al cambio de
  // uid y no al botón de cerrar sesión para cubrir también cuando Firebase
  // cierra la sesión por su cuenta; un refresco de token (claimsSync)
  // mantiene el uid, así que no borra nada.
  const unsubscribeAuth = useAuthStore.subscribe((state, prevState) => {
    if (state.user?.uid !== prevState.user?.uid) {
      queryClient.clear();
    }
  });

  return () => {
    appStateSubscription.remove();
    unsubscribeAuth();
  };
}

import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

interface ConnectivityState {
  isConnected: boolean;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({
  isConnected: true, // optimista hasta el primer chequeo real de NetInfo
}));

// Se llama una sola vez desde app/_layout.tsx. Es el indicador visual de
// RF-04.2 y la fuente de verdad de conectividad que consume
// lib/catalogSync.ts (bootstrapCatalogSyncOnReconnect) para reintentar el
// refresco de catálogos al reconectar. Lo que este store nunca dispara es el
// sync de datos capturados por el usuario (harvesterWorkday/harvestEntries)
// — ese trigger sigue siendo, a propósito, el botón explícito "Sincronizar
// Jornada": automatizarlo arriesga consumo de datos/batería inesperado en
// el contexto de campo que la app está diseñada para respetar.
export function bootstrapConnectivityListener(): () => void {
  return NetInfo.addEventListener((state) => {
    useConnectivityStore.setState({ isConnected: Boolean(state.isConnected) });
  });
}

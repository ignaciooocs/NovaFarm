import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

interface ConnectivityState {
  isConnected: boolean;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({
  isConnected: true, // optimista hasta el primer chequeo real de NetInfo
}));

// Se llama una sola vez desde app/_layout.tsx. Es puramente informativo — el
// indicador visual de RF-04.2 — y nunca dispara un sync automático: el
// trigger sigue siendo, a propósito, el botón explícito "Sincronizar Jornada".
export function bootstrapConnectivityListener(): () => void {
  return NetInfo.addEventListener((state) => {
    useConnectivityStore.setState({ isConnected: Boolean(state.isConnected) });
  });
}

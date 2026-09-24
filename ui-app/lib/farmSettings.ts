import { farmsControllerFindMe } from '@/api/generated/farms/farms';
import { useConnectivityStore, useFarmSettingsStore } from '@/stores';

let inFlight: Promise<void> | null = null;

// Refresca el interruptor de la farm (recordersCanManageCatalog) desde
// server-app. Mismo patrón que lib/catalogSync.ts: disparada fire-and-forget
// desde un punto ya-online (Home) o al reconectar, con dedup para no apilar
// llamadas concurrentes, y nunca lanza — sin conexión, el valor cacheado
// (o el optimista por defecto) queda como estaba.
export function syncFarmSettings(): Promise<void> {
  if (!inFlight) {
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performSync(): Promise<void> {
  try {
    const farm = await farmsControllerFindMe();
    useFarmSettingsStore.setState({
      recordersCanManageCatalog: farm.recordersCanManageCatalog,
    });
  } catch {
    // Sin conexión (u otro error): el valor cacheado queda tal como estaba.
  }
}

// Se llama una sola vez desde app/_layout.tsx, junto a
// bootstrapCatalogSyncOnReconnect — mismo motivo: la señal entra y sale en
// terreno, y el único trigger de Home no alcanza si el dispositivo ya
// estaba parado en una pantalla sin señal y la recupera ahí mismo.
export function bootstrapFarmSettingsOnReconnect(): () => void {
  return useConnectivityStore.subscribe((state, prevState) => {
    if (state.isConnected && !prevState.isConnected) {
      syncFarmSettings();
    }
  });
}

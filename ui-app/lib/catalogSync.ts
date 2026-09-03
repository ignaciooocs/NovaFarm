import { getFruits } from '@/api/generated/fruits/fruits';
import { getHarvesters } from '@/api/generated/harvesters/harvesters';
import { getMeasurementUnits } from '@/api/generated/measurement-units/measurement-units';
import { db } from '@/db/client';
import { fruits, harvesters, measurementUnits } from '@/db/schema';
import { useConnectivityStore } from '@/stores';

let inFlight: Promise<void> | null = null;

// Refresca la caché local de solo lectura de fruits/harvesters/measurementUnits
// (ver el gap documentado en docs/diagrams/ui-arquitectura.md) haciendo upsert
// por `id` (= _id del server) sobre las tablas locales. Pensada para
// dispararse en un punto natural ya-online (Home, ver app/(app)/home.tsx) o al
// reconectar (bootstrapCatalogSyncOnReconnect) — nunca lanza: sin conexión u
// otro error, la caché simplemente queda como estaba.
//
// Dedup: Home dispara esto en cada focus y el listener de reconexión puede
// sumar más llamadas con señal intermitente — sin este guard, cada una
// arrancaba su propio fetch+transacción en paralelo. Si ya hay una en curso,
// las llamadas siguientes esperan esa misma en vez de lanzar otra.
export function syncCatalogs(): Promise<void> {
  if (!inFlight) {
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performSync(): Promise<void> {
  try {
    const { fruitsControllerFindAll } = getFruits();
    const { harvestersControllerFindAll } = getHarvesters();
    const { measurementUnitsControllerFindAll } = getMeasurementUnits();

    const [fruitsResult, harvestersResult, unitsResult] = await Promise.all([
      fruitsControllerFindAll(),
      harvestersControllerFindAll(),
      measurementUnitsControllerFindAll(),
    ]);

    // Todo el upsert en una única transacción (BEGIN/COMMIT una sola vez,
    // no una por fila) usando `.run()` — el driver `expo-sqlite` que usa
    // este proyecto ejecuta sincrónicamente sobre el hilo de JS
    // (`executeSync`), y sin agrupar en una transacción, cada `insert`
    // suelto hace su propio auto-commit (con su propio fsync a disco):
    // con decenas de harvesters eso bloqueaba la UI de forma perceptible
    // cada vez que se disparaba el sync. Agrupado en una transacción,
    // corre en la práctica al instante.
    db.transaction((tx) => {
      fruitsResult.forEach((fruit) => {
        const row = {
          farmId: fruit.farmId,
          name: fruit.name,
          active: fruit.active,
        };
        tx.insert(fruits)
          .values({ id: fruit._id, ...row })
          .onConflictDoUpdate({ target: fruits.id, set: row })
          .run();
      });

      harvestersResult.forEach((harvester) => {
        const row = {
          farmId: harvester.farmId,
          firstName: harvester.firstName,
          lastName: harvester.lastName,
          nickname: harvester.nickname ?? null,
          active: harvester.active,
        };
        tx.insert(harvesters)
          .values({ id: harvester._id, ...row })
          .onConflictDoUpdate({ target: harvesters.id, set: row })
          .run();
      });

      unitsResult.forEach((unit) => {
        const row = {
          farmId: unit.farmId,
          name: unit.name,
          kgFactor: unit.kgFactor,
          active: unit.active,
        };
        tx.insert(measurementUnits)
          .values({ id: unit._id, ...row })
          .onConflictDoUpdate({ target: measurementUnits.id, set: row })
          .run();
      });
    });
  } catch {
    // Sin conexión (u otro error de red/servidor): la caché local queda tal
    // como estaba. No es una operación crítica de cara al usuario — el punto
    // de esta función es aprovechar la conexión cuando la hay, no exigirla.
  }
}

// Se llama una sola vez desde app/_layout.tsx (junto a los otros bootstrap*
// de stores/index.ts). En terreno la señal entra y sale — el único trigger
// de Home (useFocusEffect) no alcanza si el dispositivo ya estaba parado en
// Home sin conexión y la recupera sin navegar a ninguna otra pantalla. Este
// listener reintenta syncCatalogs() apenas useConnectivityStore pasa de
// desconectado a conectado, sin importar en qué pantalla esté el usuario.
// A diferencia de "Sincronizar Jornada" (que sigue siendo, a propósito, un
// botón explícito — ver useConnectivityStore.ts), esto es solo una lectura
// de catálogos de referencia, no sube datos capturados por el usuario, así
// que automatizarlo no choca con esa decisión.
export function bootstrapCatalogSyncOnReconnect(): () => void {
  return useConnectivityStore.subscribe((state, prevState) => {
    if (state.isConnected && !prevState.isConnected) {
      syncCatalogs();
    }
  });
}

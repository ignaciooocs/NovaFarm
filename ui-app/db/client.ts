import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// El nombre conserva el de la app antes de llamarse NovaFarm, **a
// propósito**: es la ruta del archivo en el teléfono, no una marca que
// alguien vea. Renombrarlo haría que cada dispositivo que ya tiene la app
// abra una base nueva y vacía, y una jornada sin sincronizar quedaría
// inalcanzable — el archivo viejo sigue ahí, pero nadie lo lee. No tocar
// sin una migración que copie los datos.
const expoDb = openDatabaseSync('anotaya.db');

// Único cliente de la base local — todo el resto de la app importa `db` de
// acá en vez de abrir su propia conexión.
export const db = drizzle(expoDb, { schema });

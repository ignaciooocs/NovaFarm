import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const expoDb = openDatabaseSync('anotaya.db');

// Único cliente de la base local — todo el resto de la app importa `db` de
// acá en vez de abrir su propia conexión.
export const db = drizzle(expoDb, { schema });

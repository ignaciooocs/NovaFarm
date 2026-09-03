import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { workdays } from './schema';

// Se asume un dispositivo trabajando una jornada a la vez, pero **por
// cuenta** — sin el filtro por uid, la jornada activa era global al
// dispositivo, no por usuario: si dos cuentas distintas (dos recorders de
// dos cuadrillas) probaban en el mismo celular, la segunda cuenta veía la
// jornada que abrió la primera. La usan Home (para mostrar la jornada
// activa) y open-workday (para no dejar abrir una segunda encima de la que
// ya está abierta).
export async function getActiveWorkday(uid: string) {
  const [row] = await db
    .select()
    .from(workdays)
    .where(and(eq(workdays.status, 'OPEN'), eq(workdays.createdByUid, uid)))
    .limit(1);
  return row ?? null;
}

// La fecha de una jornada se guarda como timestamp ISO en UTC
// (`new Date().toISOString()` en open-workday.tsx), así que "¿es de hoy?"
// NO se contesta comparando los primeros 10 caracteres del string: en Chile
// (UTC-3/-4) una jornada abierta a las 21:30 queda guardada con la fecha UTC
// del día siguiente, y el string diría "mañana". Hay que comparar el día
// calendario local, que es el único que coincide con lo que la persona
// entiende por "la jornada de ayer".

function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Días calendario locales entre la fecha de la jornada y hoy: 0 es hoy, 1
 * ayer, y así. Negativo no debería pasar (una jornada del futuro), pero si
 * pasa se devuelve tal cual en vez de disfrazarlo.
 *
 * Se redondea la división porque entre dos medianoches locales puede haber
 * 23 o 25 horas cuando cambia el horario de verano — en Chile cambia dos
 * veces al año, en plena temporada de cosecha.
 */
export function daysSinceLocalDay(iso: string): number {
  const diff = startOfLocalDay(new Date()) - startOfLocalDay(new Date(iso));

  return Math.round(diff / MS_PER_DAY);
}

/**
 * Si la jornada quedó abierta de un día anterior. Es la condición que
 * dispara el aviso de "tienes una jornada sin cerrar" en vez de mandar a la
 * persona al Anotador de esa jornada sin decirle nada.
 */
export function isFromPreviousDay(iso: string): boolean {
  const days = daysSinceLocalDay(iso);

  // Una fecha ilegible no dispara el aviso: el preview de Home cae a '' si
  // la fila local no está (loadActiveWorkdayPreview), y `NaN > 0` ya daría
  // false solo — esto lo deja dicho en vez de que dependa de leer el
  // detalle.
  return Number.isFinite(days) && days > 0;
}

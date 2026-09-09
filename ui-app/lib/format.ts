// Un decimal es la resolución de toda la app: es lo que alcanza a leerse en
// una romana de campo, y es lo único que el Anotador deja tipear. Los kilos
// se guardan como vienen y se redondean acá, en la presentación.
const KG_DECIMALS = 1;

/**
 * Kilos como los lee un cosechador chileno: coma decimal, un decimal.
 *
 * No usa toLocaleString: Hermes en Android puede venir sin ICU completo
 * según cómo esté compilado el binario, y acá no hace falta nada más que
 * cambiar el punto por coma.
 */
export function formatKg(value: number): string {
  const fixed = value.toFixed(KG_DECIMALS);
  // (-0.04).toFixed(1) es "-0.0" — un total que dio cero no debería
  // mostrarse en negativo.
  const normalized = Number(fixed) === 0 ? (0).toFixed(KG_DECIMALS) : fixed;

  return normalized.replace('.', ',');
}

/**
 * Redondea a la resolución de la app.
 *
 * Multiplicar en float devuelve cosas como 3 × 12,1 = 36.299999999999997, y
 * eso quedaría guardado tal cual en SQLite. Es el mismo redondeo que hace el
 * server al sincronizar (harvest-entries.service.ts), para que el total
 * local y el del server no terminen distintos.
 */
export function roundToOneDecimal(value: number): number {
  const factor = 10 ** KG_DECIMALS;

  return Math.round(value * factor) / factor;
}

/**
 * Recorta lo tipeado a un número con a lo más un decimal, respetando el
 * separador que el usuario escribió.
 *
 * Coma y punto valen igual porque el decimal-pad de Android muestra uno u
 * otro según el idioma del teléfono. Enmascara *mientras* se tipea en vez de
 * redondear al guardar: si no, alguien escribe 20,23 y se guarda 20,2 sin
 * que se entere de que perdió los 30 gramos.
 */
export function sanitizeDecimalInput(text: string): string {
  const cleaned = text.replace(/[^0-9.,]/g, '');
  const match = /^(\d*)([.,]?)(\d*)/.exec(cleaned);
  if (!match) {
    return '';
  }

  const [, whole, separator, decimals] = match;

  return `${whole}${separator}${decimals.slice(0, KG_DECIMALS)}`;
}

/**
 * Pasa a número lo que quedó de sanitizeDecimalInput. Devuelve NaN si no hay
 * un número válido, así que quien llame tiene que validarlo.
 */
export function parseDecimalInput(text: string): number {
  return Number(text.replace(',', '.'));
}

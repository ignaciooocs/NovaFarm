// Cuánto le toca a cada cosechador por lo que entregó, según la tarifa de
// la jornada. Vive acá y no en cada pantalla porque lo usan tres lugares
// distintos (Cerrar Jornada, el detalle del Historial y el PDF) y todos
// tienen que dar exactamente el mismo número: el papel que se le muestra al
// cosechador y el que se le pasa al patrón no pueden diferir en un peso.

export type PayBasis = 'PER_UNIT' | 'PER_KG';

// La tarifa de una jornada. Los dos campos van juntos: sin base, un monto
// no se puede calcular; sin monto, la base no dice nada. Cualquiera de los
// dos en null significa "esta jornada no tiene pago definido", que **no**
// es lo mismo que un pago de cero — sin tarifa no se muestra plata en
// ninguna parte, en vez de mostrar $0 y hacer creer que nadie ganó nada.
export interface WorkdayPay {
  payRate: number | null;
  payBasis: PayBasis | null;
}

export interface DeliveredTotals {
  unitCount: number;
  totalKg: number;
}

/**
 * Traduce la tarifa a la otra unidad, para poder mostrar las dos caras del
 * mismo precio ("$500 por tarro = $50 por kilo").
 *
 * Con un envase de peso fijo las dos opciones de pago dan **exactamente la
 * misma plata** — lo único que cambia es en qué unidad se escribe el
 * precio. Mostrar la conversión es lo que evita que se lean como dos tratos
 * distintos, y de paso ahorra la multiplicación a mano, que con un factor
 * tipo 8,5 kg es donde la gente se equivoca.
 *
 * `exact` dice si la conversión da un peso redondo: $500 por un envase de
 * 3,0 kg son $166,67 por kilo, y mostrar "$167" a secas invitaría a tipear
 * ese número y terminar pagando distinto. La pantalla lo marca con ≈.
 */
export function convertRate(
  rate: number,
  kgFactor: number,
  basis: PayBasis,
): { converted: number; exact: boolean } {
  const converted = basis === 'PER_UNIT' ? rate / kgFactor : rate * kgFactor;

  return {
    converted,
    exact: Math.abs(converted - Math.round(converted)) < 0.0001,
  };
}

export function hasPay(pay: WorkdayPay): boolean {
  return pay.payRate != null && pay.payBasis != null;
}

/**
 * Pago de UN cosechador, en pesos enteros. null si la jornada no tiene
 * tarifa definida.
 *
 * Las correcciones no necesitan nada especial: un `-1` o un descuento de
 * kilos ya vienen restados dentro de los totales que llegan acá, así que el
 * monto baja solo.
 */
export function computePay(
  pay: WorkdayPay,
  totals: DeliveredTotals,
): number | null {
  if (pay.payRate == null || pay.payBasis == null) {
    return null;
  }

  const base = pay.payBasis === 'PER_UNIT' ? totals.unitCount : totals.totalKg;

  return Math.round(base * pay.payRate);
}

/**
 * Total a pagar del día: la suma de lo que le toca a cada uno, ya redondeado
 * por persona.
 *
 * Deliberadamente **no** es `total del día × tarifa`: lo que se paga son
 * pesos enteros por cabeza, así que el total tiene que ser exactamente la
 * suma de esos montos. Redondear una sola vez al final daría un número que
 * no cuadra con la suma de las boletas por unos pesos, y esa diferencia es
 * justo la que alguien reclama.
 */
export function sumPay(
  pay: WorkdayPay,
  totalsList: DeliveredTotals[],
): number | null {
  if (!hasPay(pay)) {
    return null;
  }

  return totalsList.reduce(
    (sum, totals) => sum + (computePay(pay, totals) ?? 0),
    0,
  );
}

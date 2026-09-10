import { roundToOneDecimal } from '@/lib/format';

// Pesaje de control: en un envase de peso fijo (unidad COUNT) los kilos de
// una vuelta salen del factor del catálogo — 3 bandejas = 9,0 kg — y eso es
// lo que se totaliza y lo que se paga. `measuredKg` es el peso **real** que
// alguien quiso dejar anotado para esa vuelta, y existe solo para poder
// comparar: si las bandejas van llenas de más o de menos, si conviene
// cambiar el factor, si cuadra con lo que pesó el packing.
//
// Nunca entra en el total ni en el pago. Ese límite es lo que evita el
// reclamo obvio ("anotaste que pesó 3,4 y me pagaste 3,0"): si el peso real
// tiene que mandar sobre la plata, eso es una unidad WEIGHT, no esto.

export interface WeighableEntry {
  unitCount: number;
  totalKg: number;
  measuredKg?: number | null;
}

export interface WeighingSummary {
  weighedRounds: number;
  totalRounds: number;
  measuredKg: number;
  expectedKg: number;
  differenceKg: number;
}

/**
 * Resume el pesaje de control de un conjunto de vueltas, o null si nadie
 * pesó ninguna (y entonces no se muestra nada al respecto).
 *
 * La comparación es **solo entre las vueltas que se pesaron**, no contra el
 * total del día: si se pesaron 10 de 34 bandejas, comparar 34,2 kg reales
 * contra los 102,0 kg de la jornada completa daría una diferencia inventada.
 */
export function summarizeWeighing(
  entries: WeighableEntry[],
): WeighingSummary | null {
  const weighed = entries.filter((entry) => entry.measuredKg != null);
  if (weighed.length === 0) {
    return null;
  }

  const measuredKg = weighed.reduce(
    (sum, entry) => sum + (entry.measuredKg ?? 0),
    0,
  );
  const expectedKg = weighed.reduce((sum, entry) => sum + entry.totalKg, 0);

  return {
    weighedRounds: weighed.length,
    totalRounds: entries.length,
    measuredKg: roundToOneDecimal(measuredKg),
    expectedKg: roundToOneDecimal(expectedKg),
    differenceKg: roundToOneDecimal(measuredKg - expectedKg),
  };
}

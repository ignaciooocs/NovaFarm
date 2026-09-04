export interface SuggestedFruit {
  name: string;
  icon: string;
}

// Sugerencias fijas para agregar frutas rápido, en dos lugares: el catálogo
// real (fruits.tsx, filtradas contra lo que la farm ya tiene) y el paso
// opcional del onboarding (starter-fruits.tsx, donde todavía no hay nada
// creado). No hay ícono dedicado para "mandarina" en el set de emoji — se
// repite el de naranja a propósito, el nombre ya las distingue.
export const SUGGESTED_FRUITS: SuggestedFruit[] = [
  { name: 'Palta', icon: '🥑' },
  { name: 'Limón', icon: '🍋' },
  { name: 'Naranja', icon: '🍊' },
  { name: 'Cereza', icon: '🍒' },
  { name: 'Uva', icon: '🍇' },
  { name: 'Mandarina', icon: '🍊' },
];

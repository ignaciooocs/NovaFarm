// Emoji de respaldo para un cultivo sin ícono propio (cultivo nuevo sin editar
// todavía, o una fila local que no alcanzó a sincronizar el campo `icon`).
// Mismo valor que DEFAULT_PRODUCT_ICON en server-app
// (products/schemas/product.schema.ts) — no hay paquete compartido entre las dos
// apps (ver CLAUDE.md), así que se repite ahí a propósito; acá adentro de
// ui-app sí vale la pena centralizarlo, lo usan products.tsx, home.tsx y
// history.tsx/[id].tsx.
export const DEFAULT_PRODUCT_ICON = '🥑';

// Íconos que se ofrecen al crear o editar un cultivo. Antes el emoji se
// *tipeaba* en un campo de texto — en terreno eso significa cambiar al
// teclado de emoji y buscar entre miles, para un dato que la app usa solo
// como etiqueta visual. Un set acotado y tocable resuelve el 100% de los
// casos reales de una farm chilena en un toque.
//
// Elegidos por lo que de verdad se cosecha acá (uva, cereza, manzana, palta,
// arándano, ciruela, pera, limón, naranja, kiwi, frutilla, nuez), y sin
// repetir emoji: donde no existe uno propio (mandarina, frambuesa,
// damasco) el nombre de la fruta ya la distingue en la grilla.
export const PRODUCT_ICON_OPTIONS: readonly string[] = [
  '🍇',
  '🍒',
  '🍎',
  '🥑',
  '🫐',
  '🍑',
  '🍐',
  '🍋',
  '🍊',
  '🥝',
  '🍓',
  '🌰',
];

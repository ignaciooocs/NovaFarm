// Emoji de respaldo para una fruta sin ícono propio (fruta nueva sin editar
// todavía, o una fila local que no alcanzó a sincronizar el campo `icon`).
// Mismo valor que DEFAULT_FRUIT_ICON en server-app
// (fruits/schemas/fruit.schema.ts) — no hay paquete compartido entre las dos
// apps (ver CLAUDE.md), así que se repite ahí a propósito; acá adentro de
// ui-app sí vale la pena centralizarlo, lo usan fruits.tsx, home.tsx y
// history.tsx/[id].tsx.
export const DEFAULT_FRUIT_ICON = '🍎';

/**
 * Los cultivos que la app trae de fábrica: la semilla de la colección
 * `products`, que es **global** — una sola fila "Palta" para todas las
 * farms, no una copia por farm.
 *
 * Vive en código y no en la base porque es contenido de la app, no de un
 * tenant: se siembra al arrancar (ver ProductsService.seedCatalog, que hace
 * upsert por nombre y es idempotente). Agregar una entrada acá y desplegar
 * la deja disponible para todo el mundo.
 *
 * Que esté acá NO contradice el "todo configurable en runtime" de CLAUDE.md:
 * una farm que cosecha algo que no está en esta lista lo crea igual, y esa
 * fila nace como `source: 'COMMUNITY'`, visible solo para ella hasta que se
 * la promueva. Esta lista es el atajo para el 95% de los casos, no la única
 * puerta.
 *
 * `key` es la identidad con la que se siembra y no se cambia nunca una vez
 * publicada — renombrarla crearía un producto nuevo y dejaría huérfanas a
 * las jornadas que apuntan al viejo. Agregar entradas es seguro.
 *
 * Donde el set de emoji no tiene uno propio (mandarina, frambuesa, damasco,
 * ciruela) se repite el más cercano a propósito: el nombre ya las distingue.
 */
export interface CatalogProduct {
  key: string;
  name: string;
  icon: string;
  // Se ofrece en el paso opcional del onboarding, que muestra todo junto en
  // una grilla y no aguanta el catálogo completo. Las más cosechadas acá.
  featured?: boolean;
}

export const PRODUCT_CATALOG: CatalogProduct[] = [
  // Carozos y pomáceas
  { key: 'manzana', name: 'Manzana', icon: '🍎', featured: true },
  { key: 'pera', name: 'Pera', icon: '🍐' },
  { key: 'membrillo', name: 'Membrillo', icon: '🍐' },
  { key: 'durazno', name: 'Durazno', icon: '🍑' },
  { key: 'nectarin', name: 'Nectarín', icon: '🍑' },
  { key: 'damasco', name: 'Damasco', icon: '🍑' },
  { key: 'ciruela', name: 'Ciruela', icon: '🍑' },
  { key: 'cereza', name: 'Cereza', icon: '🍒', featured: true },
  { key: 'guinda', name: 'Guinda', icon: '🍒' },

  // Uva
  { key: 'uva', name: 'Uva', icon: '🍇', featured: true },
  { key: 'uva-vinifera', name: 'Uva vinífera', icon: '🍇' },

  // Berries
  { key: 'frutilla', name: 'Frutilla', icon: '🍓', featured: true },
  { key: 'frambuesa', name: 'Frambuesa', icon: '🍓' },
  { key: 'arandano', name: 'Arándano', icon: '🫐', featured: true },
  { key: 'mora', name: 'Mora', icon: '🫐' },
  { key: 'maqui', name: 'Maqui', icon: '🫐' },
  { key: 'murta', name: 'Murta', icon: '🫐' },

  // Cítricos
  { key: 'limon', name: 'Limón', icon: '🍋', featured: true },
  { key: 'naranja', name: 'Naranja', icon: '🍊', featured: true },
  { key: 'mandarina', name: 'Mandarina', icon: '🍊' },
  { key: 'pomelo', name: 'Pomelo', icon: '🍊' },

  // Otras
  { key: 'palta', name: 'Palta', icon: '🥑', featured: true },
  { key: 'kiwi', name: 'Kiwi', icon: '🥝' },
  { key: 'aceituna', name: 'Aceituna', icon: '🫒' },
  { key: 'higo', name: 'Higo', icon: '🍇' },
  { key: 'granada', name: 'Granada', icon: '🍎' },
  { key: 'chirimoya', name: 'Chirimoya', icon: '🍈' },
  { key: 'nispero', name: 'Níspero', icon: '🍊' },
  { key: 'sandia', name: 'Sandía', icon: '🍉' },
  { key: 'melon', name: 'Melón', icon: '🍈' },
  { key: 'platano', name: 'Plátano', icon: '🍌' },
  { key: 'mango', name: 'Mango', icon: '🥭' },
  { key: 'physalis', name: 'Physalis', icon: '🍊' },

  // Frutos secos
  { key: 'nuez', name: 'Nuez', icon: '🌰' },
  { key: 'almendra', name: 'Almendra', icon: '🌰' },
  { key: 'avellana', name: 'Avellana', icon: '🌰' },
  { key: 'castana', name: 'Castaña', icon: '🌰' },
];

export function findCatalogProduct(key: string): CatalogProduct | undefined {
  return PRODUCT_CATALOG.find((product) => product.key === key);
}

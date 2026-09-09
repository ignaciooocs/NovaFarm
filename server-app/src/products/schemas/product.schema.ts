import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

// Emoji de respaldo para un cultivo sin uno propio. Mismo valor que
// DEFAULT_PRODUCT_ICON en ui-app (constants/productIcon.ts) — no hay paquete
// compartido entre las dos apps (ver CLAUDE.md), así que se repite allá a
// propósito.
export const DEFAULT_PRODUCT_ICON = '🍎';

// De dónde salió el cultivo.
//   APP       — lo trae la app (ver product-catalog.ts). Visible para todas
//               las farms.
//   COMMUNITY — lo creó una farm porque no estaba en el catálogo. Visible
//               SOLO para esa farm hasta que se lo promueva a APP.
// El aislamiento de COMMUNITY es deliberado y no es paranoia de tenant: sin
// él, el primer typo de cualquiera ("palta", "Palta Hass", "PALTA") aparece
// en el selector de todo el mundo y, peor, parte en varios productos
// distintos la métrica que esta colección existe para poder medir.
export type ProductSource = 'APP' | 'COMMUNITY';

/**
 * Un cultivo, **global y compartido entre farms**: existe UNA fila "Palta"
 * para toda la app, no una por farm.
 *
 * Es la única colección del modelo sin `farmId`, y es a propósito: no es
 * dato de un tenant sino contenido de la app, y que sea compartida es justo
 * lo que hace que `GROUP BY productId` sobre las jornadas de todas las farms
 * signifique algo. Qué cultiva cada farm se modela aparte, en `farmProducts`
 * — así ninguna consulta con datos de tenant pierde su filtro por `farmId`.
 *
 * La excepción parcial es `createdByFarmId`: un cultivo COMMUNITY sí sabe de
 * quién nació, y ese campo es lo que lo mantiene invisible para el resto.
 */
@Schema({ collection: 'products' })
export class Product {
  @Prop({ required: true })
  name!: string;

  @Prop({ default: DEFAULT_PRODUCT_ICON })
  icon?: string;

  @Prop({ required: true, enum: ['APP', 'COMMUNITY'], default: 'COMMUNITY' })
  source!: ProductSource;

  // La farm que lo creó, o null si lo trae la app. `type` explícito porque
  // Mongoose no infiere desde la unión con null.
  @Prop({
    type: Types.ObjectId,
    ref: 'Farm',
    default: null,
  })
  createdByFarmId?: Types.ObjectId | null;

  // Clave del catálogo de la app con la que se sembró (product-catalog.ts),
  // null para los de la comunidad. Es lo que hace idempotente al sembrado.
  @Prop({ type: String, default: null })
  catalogKey?: string | null;

  @Prop({ default: false })
  featured?: boolean;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Un nombre no se repite dentro de su dueño: los de la app (createdByFarmId
// null) son únicos globalmente, y los de una farm son únicos dentro de esa
// farm. Mongo trata null como un valor más en un índice único, así que este
// solo índice cubre los dos casos.
ProductSchema.index({ name: 1, createdByFarmId: 1 }, { unique: true });
ProductSchema.index({ source: 1, active: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FarmProductDocument = HydratedDocument<FarmProduct>;

/**
 * Qué cultiva una farm: la selección que hace del catálogo global
 * (`products`). Es el reemplazo directo de la vieja colección `fruits`, que
 * mezclaba las dos cosas — el cultivo en sí y el hecho de que esta farm lo
 * cosecha — en una sola fila por farm.
 *
 * Separarlas es lo que permite que exista una única "Palta" para todos y que
 * igual cada farm tenga su propio catálogo acotado. Y deja esta colección
 * —que sí es dato de tenant— con su `farmId` obligatorio, como todas.
 *
 * `active` es de la *selección*, no del cultivo: una farm que deja de
 * cosechar palta la desactiva acá sin tocar nada global ni perder sus
 * jornadas pasadas.
 */
@Schema({ collection: 'farmProducts' })
export class FarmProduct {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const FarmProductSchema = SchemaFactory.createForClass(FarmProduct);

// Una farm no puede tener dos veces el mismo cultivo en su catálogo.
FarmProductSchema.index({ farmId: 1, productId: 1 }, { unique: true });

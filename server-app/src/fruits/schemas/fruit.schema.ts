import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FruitDocument = HydratedDocument<Fruit>;

// Emoji de respaldo para una fruta que todavía no tiene uno propio elegido
// (fruta nueva, o una creada antes de que este campo existiera). Genérico a
// propósito — no intenta adivinar el emoji real de la fruta por su nombre.
export const DEFAULT_FRUIT_ICON = '🍎';

@Schema({ collection: 'fruits' })
export class Fruit {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  // Emoji elegido a mano por el admin (texto libre, no un set curado — ver
  // ui-arquitectura.md para el porqué). Nunca required: una fruta creada
  // antes de este campo no tiene que backfillearse, toDto() cae a
  // DEFAULT_FRUIT_ICON cuando no está guardado (mismo patrón que
  // recordersCanManageCatalog en farms).
  @Prop({ default: DEFAULT_FRUIT_ICON })
  icon?: string;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const FruitSchema = SchemaFactory.createForClass(Fruit);
FruitSchema.index({ farmId: 1, name: 1 }, { unique: true });

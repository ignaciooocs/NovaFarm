import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FruitDocument = HydratedDocument<Fruit>;

@Schema({ collection: 'fruits' })
export class Fruit {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const FruitSchema = SchemaFactory.createForClass(Fruit);
FruitSchema.index({ farmId: 1, name: 1 }, { unique: true });

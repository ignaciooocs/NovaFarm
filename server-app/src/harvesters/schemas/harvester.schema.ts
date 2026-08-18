import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HarvesterDocument = HydratedDocument<Harvester>;

@Schema({ collection: 'harvesters' })
export class Harvester {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  firstName!: string;

  @Prop({ required: true })
  lastName!: string;

  @Prop()
  nickname?: string;

  @Prop()
  nationalId?: string;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const HarvesterSchema = SchemaFactory.createForClass(Harvester);

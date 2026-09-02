import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type MeasurementUnitDocument = HydratedDocument<MeasurementUnit>;

@Schema({ collection: 'measurementUnits' })
export class MeasurementUnit {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  // Decimal128, not Number — kg conversion factors get multiplied across every harvest entry; float drift would compound
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  kgFactor!: Types.Decimal128;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const MeasurementUnitSchema =
  SchemaFactory.createForClass(MeasurementUnit);
MeasurementUnitSchema.index({ farmId: 1, name: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type WorkdayDocument = HydratedDocument<Workday>;

@Schema({ collection: 'workdays' })
export class Workday {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  date!: Date;

  @Prop({ type: Types.ObjectId, ref: 'Fruit', required: true })
  fruitId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MeasurementUnit', required: true })
  defaultMeasurementUnitId!: Types.ObjectId;

  @Prop({ required: true, enum: ['OPEN', 'CLOSED'], default: 'OPEN' })
  status!: 'OPEN' | 'CLOSED';

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;

  // Decimal128 to match harvestEntries.totalKg — frozen on close from a sum of those entries (RF-01.2)
  @Prop({ type: MongooseSchema.Types.Decimal128 })
  finalTotalKg?: Types.Decimal128;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  recorderId?: Types.ObjectId | null;
}

export const WorkdaySchema = SchemaFactory.createForClass(Workday);
WorkdaySchema.index({ farmId: 1, date: 1 });

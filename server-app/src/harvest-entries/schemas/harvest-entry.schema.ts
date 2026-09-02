import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type HarvestEntryDocument = HydratedDocument<HarvestEntry>;

@Schema({ collection: 'harvestEntries' })
export class HarvestEntry {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workday', required: true })
  workdayId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Harvester', required: true })
  harvesterId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MeasurementUnit', required: true })
  measurementUnitId!: Types.ObjectId;

  // Decimal128, not Number — this is the highest-volume collection; float drift would compound across a season's totals
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  unitCount!: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  totalKg!: Types.Decimal128;

  @Prop({ required: true, default: Date.now })
  recordedAt!: Date;

  // Client-generated id (the SQLite row's own id) — makes offline-sync
  // retries idempotent via the unique {workdayId, clientEntryId} index below.
  @Prop({ required: true })
  clientEntryId!: string;

  @Prop({ required: true, default: false })
  syncedOffline!: boolean;
}

export const HarvestEntrySchema = SchemaFactory.createForClass(HarvestEntry);
HarvestEntrySchema.index({ workdayId: 1, harvesterId: 1 });
HarvestEntrySchema.index({ workdayId: 1, clientEntryId: 1 }, { unique: true });

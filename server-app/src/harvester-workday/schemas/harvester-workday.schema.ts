import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HarvesterWorkdayDocument = HydratedDocument<HarvesterWorkday>;

@Schema({ collection: 'harvesterWorkday' })
export class HarvesterWorkday {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workday', required: true })
  workdayId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Harvester', required: true })
  harvesterId!: Types.ObjectId;

  @Prop({ required: true })
  workdayNumber!: number;

  // Client-generated id (the SQLite row's own id) — makes offline-sync
  // retries idempotent via the unique {workdayId, clientEntryId} index below.
  @Prop({ required: true })
  clientEntryId!: string;

  @Prop({ required: true, default: Date.now })
  addedAt!: Date;

  @Prop({ required: true, default: false })
  syncedOffline!: boolean;
}

export const HarvesterWorkdaySchema =
  SchemaFactory.createForClass(HarvesterWorkday);
HarvesterWorkdaySchema.index(
  { workdayId: 1, workdayNumber: 1 },
  { unique: true },
);
HarvesterWorkdaySchema.index(
  { workdayId: 1, harvesterId: 1 },
  { unique: true },
);
HarvesterWorkdaySchema.index(
  { workdayId: 1, clientEntryId: 1 },
  { unique: true },
);

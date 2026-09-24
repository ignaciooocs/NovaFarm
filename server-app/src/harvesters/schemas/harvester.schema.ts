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

  @Prop({ select: false })
  nationalId?: string;

  @Prop({ required: true, default: true })
  active!: boolean;

  // Client-generated id (ui-app's local harvester row id) — only present for
  // harvesters registered offline in the field via POST /harvesters/sync
  // (same idempotency pattern as workdays/harvesterWorkday/harvestEntries).
  // A harvester created by an admin from the catalog screen (POST
  // /harvesters, unchanged) never has one. Optional, not required.
  @Prop()
  clientEntryId?: string;
}

export const HarvesterSchema = SchemaFactory.createForClass(Harvester);
// Partial: most documents never have clientEntryId (admin-created), and a
// plain unique index would treat all of those "missing" values as one
// repeated value and collide after the second one.
HarvesterSchema.index(
  { farmId: 1, clientEntryId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientEntryId: { $exists: true } },
  },
);

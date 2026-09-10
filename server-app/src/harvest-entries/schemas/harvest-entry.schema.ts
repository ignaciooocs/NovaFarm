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

  // Peso **real** de esta vuelta, opcional y solo para unidades COUNT: el
  // envase de peso fijo dice 3,0 kg y alguien quiso dejar anotado que en
  // realidad trajo 3,4. Es un dato de control (merma, envases mal llenados,
  // cuadrar con el packing) y **nunca** entra en totalKg ni en el pago — si
  // el peso tiene que mandar sobre la plata, eso es una unidad WEIGHT, no
  // esto. Sin ese límite, la app diría "pesó 3,4" y pagaría 3,0, que es el
  // reclamo obvio.
  //
  // Ojo con no confundirlo con `weightKg` del DTO de sync: ese es lo que
  // marca la romana en una unidad WEIGHT, se convierte en totalKg y no se
  // guarda aparte. Este se guarda y no se convierte en nada.
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null })
  measuredKg?: Types.Decimal128 | null;

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

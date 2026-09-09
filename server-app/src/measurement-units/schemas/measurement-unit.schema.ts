import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type MeasurementUnitDocument = HydratedDocument<MeasurementUnit>;

// Cómo se captura una entrega hecha con esta unidad.
//
// Antes esto no existía y se deducía de `kgFactor === 1`, lo que obligaba al
// admin a inventar unidades falsas ("capacho 1kg") y hacía que `unitCount`
// significara dos cosas distintas según la unidad: cuántos envases para uno
// de peso fijo, pero cuántos *kilos* para uno que se pesa — una vuelta de
// 22,1 kg quedaba guardada como "22,1 capachos". Con el modo explícito,
// `unitCount` siempre son envases y `totalKg` siempre son kilos.
//
// - COUNT:  envase de peso fijo (un tarro de 20kg). Se cuentan envases y
//           totalKg = unitCount × kgFactor.
// - WEIGHT: envase que se pesa en cada vuelta (un capacho). Cada entrega es
//           un envase y los kilos vienen de la romana, así que no hay
//           kgFactor.
export type MeasurementUnitMode = 'COUNT' | 'WEIGHT';

@Schema({ collection: 'measurementUnits' })
export class MeasurementUnit {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  // Sin `default` a propósito: así una unidad guardada antes de que este
  // campo existiera se hidrata con `mode` undefined y toDto() puede deducir
  // el modo del sentinel viejo, en vez de asumir COUNT y romper los
  // capachos. Ver el `??` en measurement-units.service.ts.
  @Prop({ required: true, enum: ['COUNT', 'WEIGHT'] })
  mode!: MeasurementUnitMode;

  // Decimal128, no Number — el factor se multiplica en cada entrega de la
  // cosecha; el drift de float se acumularía. Solo tiene sentido en modo
  // COUNT: las unidades WEIGHT sacan los kilos de la romana en cada
  // anotación, así que para esas queda en null.
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null })
  kgFactor?: Types.Decimal128 | null;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const MeasurementUnitSchema =
  SchemaFactory.createForClass(MeasurementUnit);
MeasurementUnitSchema.index({ farmId: 1, name: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type WorkdayDocument = HydratedDocument<Workday>;

// Sobre qué se calcula el pago del cosechador en esta jornada.
//
// - PER_UNIT: $ por envase entregado. Solo tiene sentido con una unidad
//   COUNT (envase de peso fijo): ahí "un tarro" siempre vale lo mismo.
// - PER_KG:   $ por kilo entregado. Es el único modo posible si el envase se
//   pesa en cada vuelta (WEIGHT), porque pagar por capacho sería pagar por
//   viaje y dejaría sin sentido el haberlo pesado.
export type WorkdayPayBasis = 'PER_UNIT' | 'PER_KG';

@Schema({ collection: 'workdays' })
export class Workday {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  date!: Date;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

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

  // Cuánto se paga y sobre qué, para esta jornada. **Opcional a propósito**,
  // por tres razones distintas: hay farms que pagan por día y no a trato
  // (obligarlas las haría inventar un número falso, el mismo vicio que el
  // "capacho 1kg" que mató el `mode` de measurementUnits); en terreno el
  // precio del día muchas veces todavía no está definido cuando se abre la
  // jornada, y exigirlo bloquearía la captura, que es lo único que no puede
  // fallar (RNF-01); y ya hay jornadas guardadas sin estos campos, así que
  // `required` volvería a romper cualquier .save() sobre ellas (ver la nota
  // de Mongoose en .claude/rules/server-app.md).
  //
  // Number y no Decimal128 (a diferencia de kgFactor/finalTotalKg): esto son
  // pesos chilenos enteros, sin centavos, así que no hay decimales que
  // acumulen drift al multiplicarlos. El monto derivado se redondea a peso
  // entero al mostrarlo.
  @Prop({ type: Number, default: null })
  payRate?: number | null;

  @Prop({ type: String, enum: ['PER_UNIT', 'PER_KG'], default: null })
  payBasis?: WorkdayPayBasis | null;

  // Client-generated id (ui-app's local workday row id) — makes retrying
  // POST /workdays after a dropped response idempotent, same pattern as
  // harvesterWorkday/harvestEntries. Scoped per farm (not globally unique)
  // since it's generated on-device without server coordination.
  @Prop({ required: true })
  clientEntryId!: string;
}

export const WorkdaySchema = SchemaFactory.createForClass(Workday);
WorkdaySchema.index({ farmId: 1, date: 1 });
WorkdaySchema.index({ farmId: 1, clientEntryId: 1 }, { unique: true });

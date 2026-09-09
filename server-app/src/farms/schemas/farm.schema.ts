import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FarmDocument = HydratedDocument<Farm>;

@Schema({ collection: 'farms' })
export class Farm {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: ['organization', 'independent'] })
  type!: 'organization' | 'independent';

  @Prop({ required: true, unique: true })
  invitationCode!: string;

  @Prop({ required: true, default: true })
  active!: boolean;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;

  // Interruptor único por farm (no permisos por persona): si un recorder
  // puede ver y gestionar el catálogo (products/harvesters/measurement-units)
  // además de un admin. Default true — "por defecto tienen acceso, el admin
  // lo puede apagar" fue la decisión explícita al diseñar esto (2026-09-03).
  // No afecta a "Mi equipo" — eso sigue siendo admin-only siempre, vía
  // RolesGuard, sin excepción.
  @Prop({ required: true, default: true })
  recordersCanManageCatalog!: boolean;
}

export const FarmSchema = SchemaFactory.createForClass(Farm);

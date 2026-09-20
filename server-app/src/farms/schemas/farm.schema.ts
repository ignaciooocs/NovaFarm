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

  // Hasta cuándo sirve invitationCode para unirse (una hora desde que se
  // generó, ver INVITATION_CODE_TTL_MS en farms.service.ts). Pedido del
  // usuario (2026-09-16): un código que no vence termina circulando por
  // WhatsApp para siempre, y cualquiera que lo tenga entra a la farm. Sin
  // `required` a propósito: las farms creadas antes no lo tienen, y se tratan
  // como vencidas — el admin genera uno nuevo desde Ajustes.
  @Prop({ type: Date })
  invitationCodeExpiresAt?: Date;

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

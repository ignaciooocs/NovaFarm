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
}

export const FarmSchema = SchemaFactory.createForClass(Farm);

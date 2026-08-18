import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users' })
export class User {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  // select: false — never returned by default queries; opt in explicitly (.select('+passwordHash')) for auth checks
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop()
  nationalId?: string;

  @Prop({ required: true, enum: ['recorder', 'admin'] })
  role!: 'recorder' | 'admin';

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

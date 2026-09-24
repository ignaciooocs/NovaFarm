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

  // Firebase Authentication uid — identity lives in Firebase, this is the
  // link back to this user's document. server-app never stores credentials.
  @Prop({ required: true, unique: true, index: true })
  firebaseUid!: string;

  @Prop()
  nationalId?: string;

  // A user can hold more than one role at once (e.g. admin who also
  // records some days) — array instead of a single excusive enum. Never
  // empty: a user with zero roles couldn't do anything on the farm, so
  // `validate` enforces at least one (Mongoose's `required` alone only
  // checks the array is present, not non-empty).
  @Prop({
    type: [String],
    required: true,
    enum: ['recorder', 'admin', 'supervisor'],
    validate: {
      validator: (roles: string[]) => roles.length > 0,
      message: 'roles must contain at least one role',
    },
  })
  roles!: Array<'recorder' | 'admin' | 'supervisor'>;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

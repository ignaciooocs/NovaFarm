import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserDto } from './dto';

export interface CreateUserData {
  farmId: Types.ObjectId;
  name: string;
  email: string;
  firebaseUid: string;
  role: 'recorder' | 'admin';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(data: CreateUserData): Promise<UserDto> {
    const created = await this.userModel.create({
      farmId: data.farmId,
      name: data.name,
      email: data.email,
      firebaseUid: data.firebaseUid,
      role: data.role,
      active: true,
    });

    return this.toDto(created);
  }

  async findByFirebaseUid(firebaseUid: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ firebaseUid }).exec();
  }

  private toDto(doc: UserDocument): UserDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      email: doc.email,
      role: doc.role,
      active: doc.active,
      nationalId: doc.nationalId,
    };
  }
}

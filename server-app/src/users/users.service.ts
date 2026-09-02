import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserDto } from './dto';

// Forma de los datos necesarios para crear un usuario. Distinta del DTO de
// request porque este servicio no tiene controller propio — se arma
// internamente desde AuthService durante el registro, no viene directo
// del body de una petición del cliente.
export interface CreateUserData {
  farmId: Types.ObjectId;
  name: string;
  email: string;
  firebaseUid: string;
  role: 'recorder' | 'admin';
}

/**
 * Catálogo de usuarios (recorders y admins) autenticados vía Firebase.
 * No expone un controller propio — se consume desde AuthModule durante
 * el registro y desde cualquier módulo que necesite resolver el usuario
 * de Mongo a partir del uid de Firebase.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // Crea un usuario nuevo, siempre activo por defecto.
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

  // Busca un usuario por su firebaseUid. Se usa para chequear si una cuenta
  // de Firebase ya completó el onboarding, y para resolver el usuario actual
  // a partir del uid que viaja en el token (el token no trae el _id de Mongo).
  async findByFirebaseUid(firebaseUid: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ firebaseUid }).exec();
  }

  // Convierte el documento a DTO. nationalId puede venir undefined — es
  // opcional, no se pide en el registro y se completa después.
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

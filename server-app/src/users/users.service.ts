import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { User, UserDocument } from './schemas/user.schema';
import { FindUserRequestDto, UpdateUserRequestDto, UserDto } from './dto';

// Forma de los datos necesarios para crear un usuario. Distinta del DTO de
// request porque create() no tiene endpoint propio — se arma internamente
// desde AuthService durante el registro, no viene directo del body de una
// petición del cliente (los usuarios se crean vía onboarding, no los crea
// un admin a mano).
export interface CreateUserData {
  farmId: Types.ObjectId;
  name: string;
  email: string;
  firebaseUid: string;
  roles: Array<'recorder' | 'admin'>;
}

/**
 * Catálogo de usuarios (recorders y admins) autenticados vía Firebase. Se
 * consume desde AuthModule durante el registro y desde cualquier módulo que
 * necesite resolver el usuario de Mongo a partir del uid de Firebase.
 * findAll() sí tiene un endpoint propio (GET /users, solo admin — ver
 * UsersController) para la pantalla "Mi equipo" de ui-app.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  // Crea un usuario nuevo, siempre activo por defecto.
  async create(data: CreateUserData): Promise<UserDto> {
    const created = await this.userModel.create({
      farmId: data.farmId,
      name: data.name,
      email: data.email,
      firebaseUid: data.firebaseUid,
      roles: data.roles,
      active: true,
    });

    return this.toDto(created);
  }

  // Lista el equipo de la farm (RF: "Mi equipo", solo admin — ver
  // UsersController), con filtro opcional por estado activo/inactivo.
  async findAll(
    farmId: string,
    filter: FindUserRequestDto,
  ): Promise<UserDto[]> {
    const found = await this.userModel
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.active !== undefined ? { active: filter.active } : {}),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

  // Busca un usuario por su firebaseUid. Se usa para chequear si una cuenta
  // de Firebase ya completó el onboarding, y para resolver el usuario actual
  // a partir del uid que viaja en el token (el token no trae el _id de Mongo).
  async findByFirebaseUid(firebaseUid: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ firebaseUid }).exec();
  }

  // Resuelve varios nombres a la vez a partir de sus _id de Mongo — un solo
  // `$in` en vez de una consulta por id. Se usa para mostrar "quién anotó"
  // junto a cada jornada en el historial (WorkdaysService.findAll), sin
  // necesitar el equipo completo (GET /users es admin-only, ver
  // UsersController) ni hacer N llamadas separadas.
  async findNamesByIds(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const found = await this.userModel
      .find({ _id: { $in: ids } })
      .select('name')
      .exec();

    return new Map(found.map((doc) => [doc._id.toString(), doc.name]));
  }

  // Perfil propio (GET /users/me — cualquier miembro autenticado, admin o
  // recorder, ve el suyo). A diferencia de findAll(), buscar por
  // firebaseUid ya es intrínsecamente "solo el mío": el uid sale del token
  // verificado, nunca del cliente, así que no hace falta filtrar por farmId
  // además.
  async findMe(firebaseUid: string): Promise<UserDto | null> {
    const found = await this.userModel.findOne({ firebaseUid }).exec();
    return found ? this.toDto(found) : null;
  }

  // Edita el propio perfil (PATCH /users/me): solo name y/o nationalId — ver
  // por qué no role/email/active en el comentario de UpdateUserRequestDto.
  // nationalId sigue el mismo patrón que el nickname de harvester: `null`
  // explícito lo borra ($unset), omitido lo deja como estaba. findOneAndUpdate
  // con $set puntual, no fetch+mutate+save() — mismo motivo que en
  // workdays.close()/farms.update(): .save() revalidaría el documento
  // completo.
  async updateMe(
    firebaseUid: string,
    dto: UpdateUserRequestDto,
  ): Promise<UserDto | null> {
    const changes: Partial<Pick<User, 'name' | 'nationalId'>> = {};
    const unset: Record<string, 1> = {};

    if (dto.name !== undefined) {
      changes.name = dto.name;
    }
    if (dto.nationalId === null) {
      unset.nationalId = 1;
    } else if (dto.nationalId !== undefined) {
      changes.nationalId = dto.nationalId;
    }

    const updated = await this.userModel
      .findOneAndUpdate(
        { firebaseUid },
        { $set: changes, $unset: unset },
        { new: true },
      )
      .exec();

    return updated ? this.toDto(updated) : null;
  }

  // Reasigna el set de roles recorder/supervisor de un miembro del equipo
  // (PATCH /users/:id/roles, admin only — ver UsersController). El admin
  // manda el set final deseado de esos dos, nunca "cambia de uno a otro".
  // Si el objetivo ya es admin (ej. el caso "admin que también anota", ver
  // ui-arquitectura.md §5), el rol admin se preserva siempre — este
  // endpoint solo agrega/quita recorder/supervisor *encima* de él, nunca se
  // lo puede sacar (UpdateUserRolesRequestDto tampoco deja mandar 'admin'
  // como valor nuevo, así que tampoco se lo puede otorgar a alguien más).
  // Por eso un admin sí puede terminar con roles: [] de recorder/supervisor
  // (solo admin, sin extras) mientras que a un no-admin no se lo deja
  // vaciar — un usuario sin ningún rol no podría hacer nada en la farm.
  // Filtra por farmId además de _id: un admin no puede tocar los roles de
  // alguien de otra farm.
  //
  // Los roles viven en dos lugares — el documento de Mongo (lo que devuelve
  // findAll/findMe) y el custom claim de Firebase (lo que de verdad usa
  // RolesGuard en cada request, ver farm-scope.guard.ts) — así que hay que
  // actualizar los dos o el cambio no tiene efecto real hasta que a mano se
  // llame setCustomUserClaims. setCustomUserClaims reemplaza el objeto
  // completo de claims (no lo mergea), así que hay que volver a mandar
  // farmId también, no solo roles.
  async updateRoles(
    id: string,
    farmId: string,
    roles: Array<'recorder' | 'supervisor'>,
  ): Promise<UserDto> {
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(id),
        farmId: new Types.ObjectId(farmId),
      })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isAdmin = user.roles.includes('admin');
    if (!isAdmin && roles.length === 0) {
      throw new BadRequestException('A user must have at least one role');
    }
    const finalRoles: Array<'recorder' | 'admin' | 'supervisor'> = isAdmin
      ? ['admin', ...roles]
      : roles;

    const updated = await this.userModel
      .findOneAndUpdate(
        { _id: user._id },
        { $set: { roles: finalRoles } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    await this.firebaseAdminService.setCustomUserClaims(user.firebaseUid, {
      farmId: user.farmId.toString(),
      roles: finalRoles,
    });

    return this.toDto(updated);
  }

  // Convierte el documento a DTO. nationalId puede venir undefined — es
  // opcional, no se pide en el registro y se completa después.
  private toDto(doc: UserDocument): UserDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      email: doc.email,
      roles: doc.roles,
      active: doc.active,
      nationalId: doc.nationalId,
    };
  }
}

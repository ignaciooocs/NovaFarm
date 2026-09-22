import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../common/errors/app.exception';
import { FarmsService, isInvitationCodeExpired } from '../farms/farms.service';
import { UsersService } from '../users/users.service';
import {
  RegisterAdminRequestDto,
  RegisterAdminResponseDto,
  RegisterRecorderRequestDto,
  RegisterRecorderResponseDto,
} from './dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseUser } from './guards/firebase-auth.guard';

/**
 * Orquesta el registro de cuentas nuevas: crea (o busca) la farm, crea el
 * usuario en Mongo, y publica los custom claims (farmId/roles) en Firebase
 * que el resto del backend usa para el scoping multi-tenant (FarmScopeGuard).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly farmsService: FarmsService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  // Registra un admin: crea una farm nueva ("para mi equipo" o
  // "independiente", misma acción de backend, solo cambia el type) y el
  // usuario admin asociado, y publica los claims en Firebase para que el
  // token del usuario quede con farmId/roles desde ese momento.
  async registerAdmin(
    firebaseUser: FirebaseUser,
    dto: RegisterAdminRequestDto,
  ): Promise<RegisterAdminResponseDto> {
    await this.assertNotOnboarded(firebaseUser.uid);

    const farm = await this.farmsService.create({
      name: dto.farmName,
      type: dto.farmType,
    });

    const user = await this.usersService.create({
      farmId: new Types.ObjectId(farm._id),
      name: dto.name,
      email: firebaseUser.email,
      firebaseUid: firebaseUser.uid,
      roles: ['admin'],
    });

    await this.firebaseAdminService.setCustomUserClaims(firebaseUser.uid, {
      farmId: farm._id,
      roles: ['admin'],
    });

    return { farm, user };
  }

  // Registra un recorder: busca la farm por invitationCode (debe existir y
  // estar activa, si no 404; y no haber vencido, si no 410), crea el usuario
  // recorder asociado a esa farm, y publica los claims en Firebase.
  async registerRecorder(
    firebaseUser: FirebaseUser,
    dto: RegisterRecorderRequestDto,
  ): Promise<RegisterRecorderResponseDto> {
    await this.assertNotOnboarded(firebaseUser.uid);

    const farm = await this.farmsService.findActiveByInvitationCode(
      dto.invitationCode,
    );

    if (!farm) {
      throw AppException.notFound(
        'INVITATION_CODE_INVALID',
        'Invalid or inactive invitation code',
      );
    }

    // 410 y no el mismo 404: a quien se está uniendo le sirve saber que el
    // código estaba bien pero caducó (tiene que pedir otro), en vez de
    // pensar que lo escribió mal. No expone nada de la farm.
    if (isInvitationCodeExpired(farm.invitationCodeExpiresAt)) {
      throw AppException.gone(
        'INVITATION_CODE_EXPIRED',
        'Invitation code has expired',
      );
    }

    const user = await this.usersService.create({
      farmId: new Types.ObjectId(farm._id),
      name: dto.name,
      email: firebaseUser.email,
      firebaseUid: firebaseUser.uid,
      roles: ['recorder'],
    });

    await this.firebaseAdminService.setCustomUserClaims(firebaseUser.uid, {
      farmId: farm._id,
      roles: ['recorder'],
    });

    return { farm, user };
  }

  // Evita que una misma cuenta de Firebase complete el onboarding dos veces:
  // si ya existe un usuario de Mongo con ese firebaseUid, rechaza con 409.
  private async assertNotOnboarded(firebaseUid: string): Promise<void> {
    const existing = await this.usersService.findByFirebaseUid(firebaseUid);

    if (existing) {
      throw AppException.conflict(
        'ALREADY_ONBOARDED',
        'This account has already completed onboarding',
      );
    }
  }
}

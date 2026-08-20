import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FarmsService } from '../farms/farms.service';
import { UsersService } from '../users/users.service';
import {
  RegisterAdminRequestDto,
  RegisterAdminResponseDto,
  RegisterRecorderRequestDto,
  RegisterRecorderResponseDto,
} from './dto';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseUser } from './guards/firebase-auth.guard';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly farmsService: FarmsService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

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
      role: 'admin',
    });

    await this.firebaseAdminService.setCustomUserClaims(firebaseUser.uid, {
      farmId: farm._id,
      role: 'admin',
    });

    return { farm, user };
  }

  async registerRecorder(
    firebaseUser: FirebaseUser,
    dto: RegisterRecorderRequestDto,
  ): Promise<RegisterRecorderResponseDto> {
    await this.assertNotOnboarded(firebaseUser.uid);

    const farm = await this.farmsService.findActiveByInvitationCode(
      dto.invitationCode,
    );

    if (!farm) {
      throw new NotFoundException('Invalid or inactive invitation code');
    }

    const user = await this.usersService.create({
      farmId: new Types.ObjectId(farm._id),
      name: dto.name,
      email: firebaseUser.email,
      firebaseUid: firebaseUser.uid,
      role: 'recorder',
    });

    await this.firebaseAdminService.setCustomUserClaims(firebaseUser.uid, {
      farmId: farm._id,
      role: 'recorder',
    });

    return { farm, user };
  }

  private async assertNotOnboarded(firebaseUid: string): Promise<void> {
    const existing = await this.usersService.findByFirebaseUid(firebaseUid);

    if (existing) {
      throw new ConflictException(
        'This account has already completed onboarding',
      );
    }
  }
}

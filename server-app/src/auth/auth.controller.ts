import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterAdminRequestDto,
  RegisterAdminResponseDto,
  RegisterRecorderRequestDto,
  RegisterRecorderResponseDto,
} from './dto';
import { FirebaseAuthGuard, FirebaseUser } from './guards/firebase-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/admin')
  // Límite más estricto que el default global (100/min): el registro crea
  // datos (farm + user) y consume cupo de Firebase, así que conviene
  // acotarlo más — 5 intentos por minuto por IP.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete onboarding as an admin, creating a new farm',
    description:
      'Requires a valid Firebase ID token (the account must already exist ' +
      'in Firebase Authentication; ui-app signs up/in against Firebase ' +
      'directly). After a successful call, the farmId/roles custom claims ' +
      'are set on the Firebase user — the client must force a token ' +
      'refresh (getIdToken(true)) before calling any endpoint protected by ' +
      'FarmScopeGuard, since the ID token already held in memory predates ' +
      'those claims.',
  })
  @ApiResponse({
    status: 201,
    description: 'The farm and admin user were created successfully.',
    type: RegisterAdminResponseDto,
  })
  async registerAdmin(
    @Req() request: Request & { firebaseUser: FirebaseUser },
    @Body() dto: RegisterAdminRequestDto,
  ): Promise<RegisterAdminResponseDto> {
    return this.authService.registerAdmin(request.firebaseUser, dto);
  }

  @Post('register/recorder')
  // Mismo límite estricto que register/admin — ver el comentario de arriba.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete onboarding as a recorder, joining an existing farm',
    description:
      'Requires a valid Firebase ID token (the account must already exist ' +
      'in Firebase Authentication; ui-app signs up/in against Firebase ' +
      'directly). After a successful call, the farmId/roles custom claims ' +
      'are set on the Firebase user — the client must force a token ' +
      'refresh (getIdToken(true)) before calling any endpoint protected by ' +
      'FarmScopeGuard, since the ID token already held in memory predates ' +
      'those claims.',
  })
  @ApiResponse({
    status: 201,
    description: 'The recorder user was created and joined the farm.',
    type: RegisterRecorderResponseDto,
  })
  async registerRecorder(
    @Req() request: Request & { firebaseUser: FirebaseUser },
    @Body() dto: RegisterRecorderRequestDto,
  ): Promise<RegisterRecorderResponseDto> {
    return this.authService.registerRecorder(request.firebaseUser, dto);
  }
}

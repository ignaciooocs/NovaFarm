import { Module } from '@nestjs/common';
import { FarmsModule } from '../farms/farms.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { FarmScopeGuard } from './guards/farm-scope.guard';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';

@Module({
  imports: [UsersModule, FarmsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseAdminService,
    FirebaseAuthGuard,
    FarmScopeGuard,
  ],
  exports: [FirebaseAdminService, FarmScopeGuard],
})
export class AuthModule {}

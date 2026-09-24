import { forwardRef, Module } from '@nestjs/common';
import { FarmsModule } from '../farms/farms.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { FarmScopeGuard } from './guards/farm-scope.guard';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';

// forwardRef en ambos sentidos, para Users y para Farms: AuthModule
// necesita ambos (AuthService crea/busca usuarios y farms durante el
// registro), y desde que UsersController/FarmsController existen, ambos
// necesitan AuthModule (FarmScopeGuard/RolesGuard) — ver el mismo
// forwardRef en users.module.ts y farms.module.ts.
@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => FarmsModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseAdminService,
    FirebaseAuthGuard,
    FarmScopeGuard,
    RolesGuard,
  ],
  exports: [FirebaseAdminService, FarmScopeGuard, RolesGuard],
})
export class AuthModule {}

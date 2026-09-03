import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// forwardRef: AuthModule ya importa UsersModule (AuthService crea/busca
// usuarios durante el registro) — UsersController necesita FarmScopeGuard/
// RolesGuard de AuthModule, así que la dependencia ahora va en los dos
// sentidos. Ver el mismo forwardRef en auth.module.ts.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [MongooseModule, UsersService],
})
export class UsersModule {}

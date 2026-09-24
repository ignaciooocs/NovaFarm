import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Farm, FarmSchema } from './schemas/farm.schema';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';

// forwardRef: AuthModule ya importa FarmsModule (create-farm request, etc.)
// — FarmsController ahora necesita FarmScopeGuard/RolesGuard de AuthModule,
// así que la dependencia va en los dos sentidos. Mismo patrón que
// Auth<->Users, ver el forwardRef en auth.module.ts.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Farm.name, schema: FarmSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [FarmsController],
  providers: [FarmsService],
  exports: [MongooseModule, FarmsService],
})
export class FarmsModule {}

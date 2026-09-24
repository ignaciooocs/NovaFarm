import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Harvester, HarvesterSchema } from './schemas/harvester.schema';
import { HarvestersController } from './harvesters.controller';
import { HarvestersService } from './harvesters.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Harvester.name, schema: HarvesterSchema },
    ]),
    AuthModule,
  ],
  controllers: [HarvestersController],
  providers: [HarvestersService],
  exports: [MongooseModule, HarvestersService],
})
export class HarvestersModule {}

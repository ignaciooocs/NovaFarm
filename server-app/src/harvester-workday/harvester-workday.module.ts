import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HarvestersModule } from '../harvesters/harvesters.module';
import { WorkdaysModule } from '../workdays/workdays.module';
import {
  HarvesterWorkday,
  HarvesterWorkdaySchema,
} from './schemas/harvester-workday.schema';
import { HarvesterWorkdayController } from './harvester-workday.controller';
import { HarvesterWorkdayService } from './harvester-workday.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HarvesterWorkday.name, schema: HarvesterWorkdaySchema },
    ]),
    AuthModule,
    HarvestersModule,
    WorkdaysModule,
  ],
  controllers: [HarvesterWorkdayController],
  providers: [HarvesterWorkdayService],
  exports: [MongooseModule, HarvesterWorkdayService],
})
export class HarvesterWorkdayModule {}

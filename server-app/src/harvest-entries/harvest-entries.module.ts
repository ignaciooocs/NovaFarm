import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HarvesterWorkdayModule } from '../harvester-workday/harvester-workday.module';
import { HarvestersModule } from '../harvesters/harvesters.module';
import { MeasurementUnitsModule } from '../measurement-units/measurement-units.module';
import { WorkdaysModule } from '../workdays/workdays.module';
import {
  HarvestEntry,
  HarvestEntrySchema,
} from './schemas/harvest-entry.schema';
import { HarvestEntriesController } from './harvest-entries.controller';
import { HarvestEntriesService } from './harvest-entries.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HarvestEntry.name, schema: HarvestEntrySchema },
    ]),
    AuthModule,
    HarvestersModule,
    MeasurementUnitsModule,
    WorkdaysModule,
    HarvesterWorkdayModule,
  ],
  controllers: [HarvestEntriesController],
  providers: [HarvestEntriesService],
  exports: [MongooseModule],
})
export class HarvestEntriesModule {}

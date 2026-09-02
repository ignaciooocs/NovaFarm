import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { FruitsModule } from '../fruits/fruits.module';
import { HarvestEntry, HarvestEntrySchema } from '../harvest-entries/schemas/harvest-entry.schema';
import { MeasurementUnitsModule } from '../measurement-units/measurement-units.module';
import { UsersModule } from '../users/users.module';
import { Workday, WorkdaySchema } from './schemas/workday.schema';
import { WorkdaysController } from './workdays.controller';
import { WorkdaysService } from './workdays.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workday.name, schema: WorkdaySchema },
      // Read-only access for the close() aggregation over harvestEntries.
      // Registered directly (not via HarvestEntriesModule) because
      // HarvestEntriesModule imports WorkdaysModule for findById() — going
      // through the module here would create a circular dependency.
      { name: HarvestEntry.name, schema: HarvestEntrySchema },
    ]),
    AuthModule,
    FruitsModule,
    MeasurementUnitsModule,
    UsersModule,
  ],
  controllers: [WorkdaysController],
  providers: [WorkdaysService],
  exports: [MongooseModule, WorkdaysService],
})
export class WorkdaysModule {}

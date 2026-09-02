import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { FruitsModule } from '../fruits/fruits.module';
import { HarvestEntriesModule } from '../harvest-entries/harvest-entries.module';
import { MeasurementUnitsModule } from '../measurement-units/measurement-units.module';
import { UsersModule } from '../users/users.module';
import { Workday, WorkdaySchema } from './schemas/workday.schema';
import { WorkdaysController } from './workdays.controller';
import { WorkdaysService } from './workdays.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Workday.name, schema: WorkdaySchema }]),
    AuthModule,
    FruitsModule,
    MeasurementUnitsModule,
    HarvestEntriesModule,
    UsersModule,
  ],
  controllers: [WorkdaysController],
  providers: [WorkdaysService],
  exports: [MongooseModule],
})
export class WorkdaysModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  MeasurementUnit,
  MeasurementUnitSchema,
} from './schemas/measurement-unit.schema';
import { MeasurementUnitsController } from './measurement-units.controller';
import { MeasurementUnitsService } from './measurement-units.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MeasurementUnit.name, schema: MeasurementUnitSchema },
    ]),
    AuthModule,
  ],
  controllers: [MeasurementUnitsController],
  providers: [MeasurementUnitsService],
  exports: [MongooseModule],
})
export class MeasurementUnitsModule {}

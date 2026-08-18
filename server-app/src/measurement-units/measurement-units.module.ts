import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MeasurementUnit,
  MeasurementUnitSchema,
} from './schemas/measurement-unit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MeasurementUnit.name, schema: MeasurementUnitSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class MeasurementUnitsModule {}

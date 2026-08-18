import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HarvesterWorkday,
  HarvesterWorkdaySchema,
} from './schemas/harvester-workday.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HarvesterWorkday.name, schema: HarvesterWorkdaySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class HarvesterWorkdayModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Harvester, HarvesterSchema } from './schemas/harvester.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Harvester.name, schema: HarvesterSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class HarvestersModule {}

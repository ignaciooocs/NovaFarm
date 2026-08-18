import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HarvestEntry,
  HarvestEntrySchema,
} from './schemas/harvest-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HarvestEntry.name, schema: HarvestEntrySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class HarvestEntriesModule {}

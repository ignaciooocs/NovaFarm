import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Workday, WorkdaySchema } from './schemas/workday.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Workday.name, schema: WorkdaySchema }]),
  ],
  exports: [MongooseModule],
})
export class WorkdaysModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Farm, FarmSchema } from './schemas/farm.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Farm.name, schema: FarmSchema }]),
  ],
  exports: [MongooseModule],
})
export class FarmsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Farm, FarmSchema } from './schemas/farm.schema';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Farm.name, schema: FarmSchema }]),
  ],
  controllers: [FarmsController],
  providers: [FarmsService],
  exports: [MongooseModule, FarmsService],
})
export class FarmsModule {}

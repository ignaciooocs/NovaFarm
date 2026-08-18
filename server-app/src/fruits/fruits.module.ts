import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Fruit, FruitSchema } from './schemas/fruit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Fruit.name, schema: FruitSchema }]),
  ],
  exports: [MongooseModule],
})
export class FruitsModule {}

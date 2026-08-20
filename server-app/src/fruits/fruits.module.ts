import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Fruit, FruitSchema } from './schemas/fruit.schema';
import { FruitsController } from './fruits.controller';
import { FruitsService } from './fruits.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Fruit.name, schema: FruitSchema }]),
    AuthModule,
  ],
  controllers: [FruitsController],
  providers: [FruitsService],
  exports: [MongooseModule],
})
export class FruitsModule {}

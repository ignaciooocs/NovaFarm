import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Workday, WorkdaySchema } from '../workdays/schemas/workday.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { FarmProduct, FarmProductSchema } from './schemas/farm-product.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: FarmProduct.name, schema: FarmProductSchema },
      // Solo lectura, para saber si un cultivo ya se usó en una jornada (ver
      // ProductsService). Registrado directo y no vía WorkdaysModule porque
      // ese ya importa a este — pasar por el módulo cerraría un ciclo, mismo
      // caso y misma solución que HarvestEntry en workdays.module.ts.
      { name: Workday.name, schema: WorkdaySchema },
    ]),
    AuthModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [MongooseModule, ProductsService],
})
export class ProductsModule {}

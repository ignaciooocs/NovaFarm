import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { FarmsModule } from './farms/farms.module';
import { UsersModule } from './users/users.module';
import { HarvestersModule } from './harvesters/harvesters.module';
import { ProductsModule } from './products/products.module';
import { MeasurementUnitsModule } from './measurement-units/measurement-units.module';
import { WorkdaysModule } from './workdays/workdays.module';
import { HarvesterWorkdayModule } from './harvester-workday/harvester-workday.module';
import { HarvestEntriesModule } from './harvest-entries/harvest-entries.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // Límite por defecto para toda la API: 100 requests por minuto por IP.
    // Es una base generosa contra abuso genérico; los endpoints más
    // sensibles (registro en AuthController) tienen su propio @Throttle()
    // más estricto encima de este.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    FarmsModule,
    UsersModule,
    HarvestersModule,
    ProductsModule,
    MeasurementUnitsModule,
    WorkdaysModule,
    HarvesterWorkdayModule,
    HarvestEntriesModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Aplica el rate limiting a todas las rutas por defecto — un guard
    // específico (@Throttle en un controller) puede ajustar el límite,
    // pero ninguna ruta queda sin este piso mínimo salvo que use @SkipThrottle().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggerMiddleware)
      // /health lo golpea el healthcheck del PaaS cada pocos segundos: si se
      // loguea, el ruido tapa las requests reales de la app.
      .exclude('health')
      // '{*splat}' y no '*' ni '*splat': con Express 5 (path-to-regexp v8) el
      // comodín desnudo ya no es una ruta válida y tira al levantar el
      // server, y '*splat' sin llaves exige al menos un segmento — deja fuera
      // la raíz ('/api/v1/'), que entonces no aparece en el log.
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FarmsModule } from './farms/farms.module';
import { UsersModule } from './users/users.module';
import { HarvestersModule } from './harvesters/harvesters.module';
import { FruitsModule } from './fruits/fruits.module';
import { MeasurementUnitsModule } from './measurement-units/measurement-units.module';
import { WorkdaysModule } from './workdays/workdays.module';
import { HarvesterWorkdayModule } from './harvester-workday/harvester-workday.module';
import { HarvestEntriesModule } from './harvest-entries/harvest-entries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    FarmsModule,
    UsersModule,
    HarvestersModule,
    FruitsModule,
    MeasurementUnitsModule,
    WorkdaysModule,
    HarvesterWorkdayModule,
    HarvestEntriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

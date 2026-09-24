import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { MeasurementUnitMode } from '../../schemas/measurement-unit.schema';

export class CreateMeasurementUnitRequestDto {
  @ApiProperty({
    description: 'Display name of the unit, unique within the farm',
    example: 'Crate 10kg',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'COUNT for a fixed-weight container (kgFactor required), WEIGHT for one weighed on every round (kgFactor must be omitted)',
    enum: ['COUNT', 'WEIGHT'],
    example: 'COUNT',
  })
  @IsIn(['COUNT', 'WEIGHT'])
  mode!: MeasurementUnitMode;

  @ApiPropertyOptional({
    description:
      'Conversion factor to kilos (e.g. a 10kg crate is 10). Required in COUNT mode, ignored in WEIGHT mode. Capped at one decimal so every derived totalKg has at most one too.',
    example: 10,
  })
  // Para las unidades WEIGHT no se valida nada (el service les guarda null);
  // para COUNT queda de hecho obligatorio, porque IsNumber rechaza undefined.
  @ValidateIf((dto: CreateMeasurementUnitRequestDto) => dto.mode !== 'WEIGHT')
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  kgFactor?: number;
}

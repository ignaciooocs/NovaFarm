import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import type { MeasurementUnitMode } from '../../schemas/measurement-unit.schema';

/**
 * Request shape for PATCH /api/v1/measurement-units/:id — partial update.
 * All fields are optional so the client can send just `{ active: false }`
 * to deactivate, or any subset of the editable fields together.
 */
export class UpdateMeasurementUnitRequestDto {
  @ApiPropertyOptional({
    description: 'New display name for the unit, unique within the farm',
    example: 'Crate 10kg',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Switch how deliveries are captured. Switching to WEIGHT clears kgFactor; switching to COUNT requires one (either in this same request or already stored).',
    enum: ['COUNT', 'WEIGHT'],
    example: 'COUNT',
  })
  @IsOptional()
  @IsIn(['COUNT', 'WEIGHT'])
  mode?: MeasurementUnitMode;

  @ApiPropertyOptional({
    description:
      'Conversion factor to kilos (e.g. a 10kg crate is 10). Only meaningful for COUNT units. Capped at one decimal so every derived totalKg has at most one too.',
    example: 10,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  kgFactor?: number;

  @ApiPropertyOptional({
    description: 'Whether the measurement unit is active',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

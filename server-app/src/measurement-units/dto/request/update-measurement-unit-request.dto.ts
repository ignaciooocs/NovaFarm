import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

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
      'Conversion factor to kilos (e.g. a 10kg crate is 10). Use 1 for direct-weighing mode.',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
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

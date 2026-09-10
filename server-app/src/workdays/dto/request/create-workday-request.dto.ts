import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { WorkdayPayBasis } from '../../schemas/workday.schema';

/**
 * Request shape for POST /api/v1/workdays — opens a new workday.
 * Deliberately does NOT accept `recorderId`, `farmId` or `status`: recorderId
 * is derived server-side from the authenticated caller (null/guest mode only
 * when an admin opens it), farmId comes from `@CurrentFarm()`, and a new
 * workday is always OPEN.
 */
export class CreateWorkdayRequestDto {
  @ApiProperty({
    description:
      'Client-generated id (the local workday row id) — makes retrying this call after a dropped response idempotent, same pattern as harvester-workday/harvest-entries sync',
    example: 'local-8f3a2b1c',
  })
  @IsString()
  @IsNotEmpty()
  clientEntryId!: string;

  @ApiProperty({
    description: 'Date this workday covers (ISO 8601)',
    example: '2026-09-02',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description:
      'Product being harvested this workday (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  @IsMongoId()
  productId!: string;

  @ApiProperty({
    description:
      'Default measurement unit for entries recorded this workday (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  @IsMongoId()
  defaultMeasurementUnitId!: string;

  @ApiPropertyOptional({
    description:
      'How much a harvester is paid for what they deliver this workday, in whole Chilean pesos. Optional — a farm that pays a day wage, or that does not know the price yet when it opens the workday, simply omits it. Must be sent together with payBasis.',
    example: 500,
  })
  // Los dos campos del pago van juntos o no van: un monto sin base no se
  // puede calcular, y una base sin monto no dice nada. El ValidateIf hace
  // que cada uno sea obligatorio en cuanto el otro venga (mismo recurso que
  // el kgFactor de las unidades COUNT).
  @ValidateIf(
    (dto: CreateWorkdayRequestDto) =>
      dto.payRate !== undefined || dto.payBasis !== undefined,
  )
  @IsInt()
  @IsPositive()
  payRate?: number;

  @ApiPropertyOptional({
    description:
      'What the pay rate is applied to. PER_UNIT (per container) is rejected for a WEIGHT unit, where each container is weighed and paying per container would mean paying per trip. Must be sent together with payRate.',
    enum: ['PER_UNIT', 'PER_KG'],
    example: 'PER_UNIT',
  })
  @ValidateIf(
    (dto: CreateWorkdayRequestDto) =>
      dto.payRate !== undefined || dto.payBasis !== undefined,
  )
  @IsIn(['PER_UNIT', 'PER_KG'])
  payBasis?: WorkdayPayBasis;

  @ApiPropertyOptional({
    description:
      'When the workday was actually opened on the device (ISO 8601). Only needed when it was opened offline and uploaded later — omitted, the server stamps its own clock, which would date a Monday workday on the Wednesday it finally synced.',
    example: '2026-09-02T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdAt?: string;
}

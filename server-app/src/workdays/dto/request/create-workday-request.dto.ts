import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsMongoId } from 'class-validator';

/**
 * Request shape for POST /api/v1/workdays — opens a new workday.
 * Deliberately does NOT accept `recorderId`, `farmId` or `status`: recorderId
 * is derived server-side from the authenticated caller (null/guest mode only
 * when an admin opens it), farmId comes from `@CurrentFarm()`, and a new
 * workday is always OPEN.
 */
export class CreateWorkdayRequestDto {
  @ApiProperty({
    description: 'Date this workday covers (ISO 8601)',
    example: '2026-09-02',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description:
      'Fruit being harvested this workday (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  @IsMongoId()
  fruitId!: string;

  @ApiProperty({
    description:
      'Default measurement unit for entries recorded this workday (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  @IsMongoId()
  defaultMeasurementUnitId!: string;
}

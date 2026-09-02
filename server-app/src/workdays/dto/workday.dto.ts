import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Canonical shape of a Workday entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 */
export class WorkdayDto {
  @ApiProperty({
    description: 'Unique identifier of the workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this workday belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Date this workday covers (ISO 8601)',
    example: '2026-09-02T00:00:00.000Z',
  })
  date!: string;

  @ApiProperty({
    description: 'Fruit being harvested this workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  fruitId!: string;

  @ApiProperty({
    description: 'Default measurement unit for entries recorded this workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  defaultMeasurementUnitId!: string;

  @ApiProperty({
    description: 'Lifecycle status of the workday',
    enum: ['OPEN', 'CLOSED'],
    example: 'OPEN',
  })
  status!: 'OPEN' | 'CLOSED';

  @ApiProperty({
    description: 'When the workday was opened (ISO 8601)',
    example: '2026-09-02T08:00:00.000Z',
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description:
      'Frozen aggregate total in kilos, computed and set when the workday is closed (RF-01.2)',
    example: 128.5,
  })
  finalTotalKg?: number;

  @ApiProperty({
    description:
      'Recorder attributed to this workday, or null for guest mode (opened by an admin, not tied to a specific recorder)',
    example: '64f1a2b3c4d5e6f7a8b9c0d4',
    nullable: true,
  })
  recorderId!: string | null;
}

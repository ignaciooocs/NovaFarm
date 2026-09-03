import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  NotEquals,
} from 'class-validator';

/**
 * One delivery entry within a POST /api/v1/harvest-entries/sync batch.
 */
export class SyncHarvestEntryEntryDto {
  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) — makes retrying this exact entry idempotent',
    example: 'local-4d2e9a7f',
  })
  @IsString()
  @IsNotEmpty()
  clientEntryId!: string;

  @ApiProperty({
    description:
      'Harvester who made this delivery (must exist, be active, and already be on the workday roster)',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  @IsMongoId()
  harvesterId!: string;

  @ApiProperty({
    description:
      'Measurement unit used for this entry (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d4',
  })
  @IsMongoId()
  measurementUnitId!: string;

  @ApiProperty({
    description:
      'Number of units delivered (or the raw kilo weight, in direct-weighing mode). Negative values are corrections (RF-02.3, e.g. the -1 button undoing a mis-tap) — never zero.',
    example: 3,
  })
  @IsNumber()
  @NotEquals(0)
  unitCount!: number;

  @ApiProperty({
    description:
      'When the delivery actually happened on-device (ISO 8601), not when it is synced',
    example: '2026-09-02T09:15:00.000Z',
  })
  @IsDateString()
  recordedAt!: string;
}

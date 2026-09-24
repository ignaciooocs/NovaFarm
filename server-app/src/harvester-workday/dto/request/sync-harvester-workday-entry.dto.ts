import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * One roster entry within a POST /api/v1/harvester-workday/sync batch.
 */
export class SyncHarvesterWorkdayEntryDto {
  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) — makes retrying this exact entry idempotent',
    example: 'local-8f3a2b1c',
  })
  @IsString()
  @IsNotEmpty()
  clientEntryId!: string;

  @ApiProperty({
    description:
      'Harvester being added to the roster (must exist and be active in the caller farm roster)',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  @IsMongoId()
  harvesterId!: string;

  @ApiProperty({
    description:
      'Per-workday correlative assigned on-device, unique within the workday',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  workdayNumber!: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import { SyncHarvesterWorkdayEntryDto } from './sync-harvester-workday-entry.dto';

/**
 * Request shape for POST /api/v1/harvester-workday/sync — uploads a batch of
 * roster entries captured offline. `entries` is capped at 500 to match the
 * chunk size ui-app uploads in (see arquitectura.md §2), as defense against
 * the PaaS proxy body-size/timeout ceilings that an unbounded batch risks.
 */
export class SyncHarvesterWorkdayRequestDto {
  @ApiProperty({
    description: 'Workday this roster batch belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  @IsMongoId()
  workdayId!: string;

  @ApiProperty({
    description: 'Batch of roster entries captured offline',
    type: [SyncHarvesterWorkdayEntryDto],
  })
  @ValidateNested({ each: true })
  @Type(() => SyncHarvesterWorkdayEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: SyncHarvesterWorkdayEntryDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import { SyncHarvestEntryEntryDto } from './sync-harvest-entry-entry.dto';

/**
 * Request shape for POST /api/v1/harvest-entries/sync — uploads a batch of
 * delivery entries captured offline. `entries` is capped at 500 to match the
 * chunk size ui-app uploads in (see arquitectura.md §2), as defense against
 * the PaaS proxy body-size/timeout ceilings that an unbounded batch risks.
 */
export class SyncHarvestEntryRequestDto {
  @ApiProperty({
    description: 'Workday this entries batch belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  @IsMongoId()
  workdayId!: string;

  @ApiProperty({
    description: 'Batch of delivery entries captured offline',
    type: [SyncHarvestEntryEntryDto],
  })
  @ValidateNested({ each: true })
  @Type(() => SyncHarvestEntryEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: SyncHarvestEntryEntryDto[];
}

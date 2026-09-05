import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { SyncHarvesterEntryDto } from './sync-harvester-entry.dto';

/**
 * Request shape for POST /api/v1/harvesters/sync — uploads a batch of
 * harvesters registered offline in the field. `entries` is capped at 500 to
 * match the chunk size ui-app uploads in for the other /sync endpoints (see
 * arquitectura.md §2), even though in practice this batch is only ever a
 * handful of people.
 */
export class SyncHarvesterRequestDto {
  @ApiProperty({
    description: 'Batch of harvesters registered offline',
    type: [SyncHarvesterEntryDto],
  })
  @ValidateNested({ each: true })
  @Type(() => SyncHarvesterEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: SyncHarvesterEntryDto[];
}

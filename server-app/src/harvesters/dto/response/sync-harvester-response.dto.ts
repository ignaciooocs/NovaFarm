import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Per-item result for POST /api/v1/harvesters/sync. Standalone shape (not
 * extending HarvesterDto) — this describes a sync operation's outcome, not
 * the entity itself. Always returned with HTTP 200, even when every item is
 * rejected — same reasoning as SyncHarvesterWorkdayResponseDto.
 */
export class SyncHarvesterResponseDto {
  @ApiProperty({
    description: 'Echoes the clientEntryId this result corresponds to',
    example: 'local-8f3a2b1c',
  })
  clientEntryId!: string;

  @ApiProperty({
    description: 'Outcome of this entry',
    enum: ['created', 'already-synced', 'rejected'],
    example: 'created',
  })
  status!: 'created' | 'already-synced' | 'rejected';

  @ApiPropertyOptional({
    description: 'Present when status is "rejected"',
    example: 'Something went wrong',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Server-assigned id, present when status is not "rejected"',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id?: string;
}

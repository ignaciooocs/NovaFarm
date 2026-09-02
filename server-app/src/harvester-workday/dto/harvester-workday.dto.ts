import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical shape of a HarvesterWorkday (roster) entity, independent of any
 * specific action. Request/response DTOs for individual actions are typed
 * against this class.
 */
export class HarvesterWorkdayDto {
  @ApiProperty({
    description: 'Unique identifier of the roster entry',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this roster entry belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Workday this roster entry belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  workdayId!: string;

  @ApiProperty({
    description: 'Harvester added to the workday roster',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  harvesterId!: string;

  @ApiProperty({
    description:
      'Per-workday correlative assigned on-device, unique within the workday',
    example: 1,
  })
  workdayNumber!: number;

  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) used to make offline-sync retries idempotent',
    example: 'local-8f3a2b1c',
  })
  clientEntryId!: string;

  @ApiProperty({
    description: 'When the harvester was added to the roster (ISO 8601)',
    example: '2026-09-02T08:05:00.000Z',
  })
  addedAt!: string;

  @ApiProperty({
    description: 'Whether this record originated from an offline sync',
    example: true,
  })
  syncedOffline!: boolean;
}

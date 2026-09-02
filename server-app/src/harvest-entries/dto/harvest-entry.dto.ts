import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical shape of a HarvestEntry (delivery/"Anotar" tally) entity,
 * independent of any specific action. Request/response DTOs for individual
 * actions are typed against this class.
 */
export class HarvestEntryDto {
  @ApiProperty({
    description: 'Unique identifier of the entry',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this entry belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Workday this entry belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  workdayId!: string;

  @ApiProperty({
    description: 'Harvester who made this delivery',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  harvesterId!: string;

  @ApiProperty({
    description: 'Measurement unit used for this specific entry',
    example: '64f1a2b3c4d5e6f7a8b9c0d4',
  })
  measurementUnitId!: string;

  @ApiProperty({
    description:
      'Number of units delivered (or the raw kilo weight, in direct-weighing mode)',
    example: 3,
  })
  unitCount!: number;

  @ApiProperty({
    description:
      'Total kilos, computed server-side as unitCount x measurementUnit.kgFactor',
    example: 30,
  })
  totalKg!: number;

  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) used to make offline-sync retries idempotent',
    example: 'local-4d2e9a7f',
  })
  clientEntryId!: string;

  @ApiProperty({
    description:
      'When the delivery actually happened on-device (ISO 8601), not when it was synced',
    example: '2026-09-02T09:15:00.000Z',
  })
  recordedAt!: string;

  @ApiProperty({
    description: 'Whether this record originated from an offline sync',
    example: true,
  })
  syncedOffline!: boolean;
}

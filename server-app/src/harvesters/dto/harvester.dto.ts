import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Canonical shape of a Harvester entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 *
 * `nationalId` is intentionally NOT part of this shape: it's sensitive PII
 * not collected at quick field registration and excluded from default query
 * projections (`select: false` on the schema) to avoid leaking it through
 * roster/list endpoints. No endpoint in this module's current scope needs to
 * return it.
 */
export class HarvesterDto {
  @ApiProperty({
    description: 'Unique identifier of the harvester',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this harvester belongs to (roster is scoped per farm)',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'First name of the harvester',
    example: 'Juan',
  })
  firstName!: string;

  @ApiProperty({
    description: 'Last name of the harvester',
    example: 'Perez',
  })
  lastName!: string;

  @ApiPropertyOptional({
    description:
      'Optional nickname to help disambiguate harvesters with repeated names',
    example: 'Juanito',
  })
  nickname?: string;

  @ApiProperty({
    description: 'Whether the harvester is active',
    example: true,
  })
  active!: boolean;
}

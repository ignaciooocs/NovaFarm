import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical shape of a Farm entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 */
export class FarmDto {
  @ApiProperty({
    description: 'Unique identifier of the farm',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Display name of the farm',
    example: 'Fundo Los Alamos',
  })
  name!: string;

  @ApiProperty({
    description:
      "UI-only classification: whether to show the 'invite your team' step after creation. No backend logic differs between the two values.",
    enum: ['organization', 'independent'],
    example: 'organization',
  })
  type!: 'organization' | 'independent';

  @ApiProperty({
    description:
      'Code a recorder enters during onboarding to join this farm. Regenerable by an admin, no expiry.',
    example: 'A1B2C3',
  })
  invitationCode!: string;

  @ApiProperty({
    description: 'Whether the farm is active',
    example: true,
  })
  active!: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-08-19T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description:
      'Whether recorders (not just admins) can view/manage the farm catalog (fruits/harvesters/measurement-units). A single per-farm switch, not per-user permissions. Does not affect the team roster, which stays admin-only regardless.',
    example: true,
  })
  recordersCanManageCatalog!: boolean;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Canonical shape of a User entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 *
 * Deliberately omits firebaseUid — that's an internal linkage to the user's
 * Firebase Authentication record, never exposed to the client.
 */
export class UserDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this user belongs to (tenant scope)',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Display name of the user',
    example: 'Juana Perez',
  })
  name!: string;

  @ApiProperty({
    description: 'Email address of the user',
    example: 'juana.perez@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Role of the user within their farm',
    enum: ['recorder', 'admin'],
    example: 'admin',
  })
  role!: 'recorder' | 'admin';

  @ApiProperty({
    description: 'Whether the user is active',
    example: true,
  })
  active!: boolean;

  @ApiPropertyOptional({
    description:
      'National ID (optional/nullable — not collected at quick field registration, filled in later by an admin)',
    example: '12.345.678-9',
  })
  nationalId?: string;
}

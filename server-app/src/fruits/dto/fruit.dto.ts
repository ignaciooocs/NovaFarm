import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical shape of a Fruit entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 */
export class FruitDto {
  @ApiProperty({
    description: 'Unique identifier of the fruit',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this fruit belongs to (catalogs are scoped per farm)',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Display name of the fruit, unique within the farm',
    example: 'Lemon',
  })
  name!: string;

  @ApiProperty({
    description: 'Whether the fruit is active',
    example: true,
  })
  active!: boolean;
}

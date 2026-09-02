import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical shape of a MeasurementUnit entity, independent of any specific
 * action. Request/response DTOs for individual actions are typed against
 * this class.
 */
export class MeasurementUnitDto {
  @ApiProperty({
    description: 'Unique identifier of the measurement unit',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this measurement unit belongs to (scoped per farm)',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Display name of the unit, unique within the farm',
    example: 'Crate 10kg',
  })
  name!: string;

  @ApiProperty({
    description:
      'Conversion factor to kilos (e.g. a 10kg crate is 10). A factor of 1 represents direct-weighing mode.',
    example: 10,
  })
  kgFactor!: number;

  @ApiProperty({
    description: 'Whether the measurement unit is active',
    example: true,
  })
  active!: boolean;
}

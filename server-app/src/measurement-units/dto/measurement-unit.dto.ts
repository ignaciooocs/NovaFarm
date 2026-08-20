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
    description:
      'Farm this measurement unit belongs to (catalogs are scoped per farm)',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Display name of the measurement unit, unique within the farm',
    example: 'Caja 10kg',
  })
  name!: string;

  @ApiProperty({
    description:
      'Conversion factor to kilograms, as a decimal string. Stored as ' +
      'Decimal128 in Mongo to avoid float drift when multiplied across ' +
      'every harvest entry; returned as a string (not a number) so the ' +
      'API never round-trips it through floating point.',
    example: '10.500',
  })
  kgFactor!: string;

  @ApiProperty({
    description: 'Whether the measurement unit is active',
    example: true,
  })
  active!: boolean;
}

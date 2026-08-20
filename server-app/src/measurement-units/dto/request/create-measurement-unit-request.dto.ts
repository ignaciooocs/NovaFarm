import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateMeasurementUnitRequestDto {
  @ApiProperty({
    description: 'Display name of the measurement unit, unique within the farm',
    example: 'Caja 10kg',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'Conversion factor to kilograms (e.g. a 10kg crate → 10). Sent as a ' +
      'plain number; converted to Decimal128 internally for storage.',
    example: 10.5,
  })
  @IsNumber()
  @IsPositive()
  kgFactor!: number;
}

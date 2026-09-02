import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateMeasurementUnitRequestDto {
  @ApiProperty({
    description: 'Display name of the unit, unique within the farm',
    example: 'Crate 10kg',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'Conversion factor to kilos (e.g. a 10kg crate is 10). Use 1 for direct-weighing mode.',
    example: 10,
  })
  @IsNumber()
  @IsPositive()
  kgFactor!: number;
}

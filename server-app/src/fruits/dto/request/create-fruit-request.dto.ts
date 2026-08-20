import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFruitRequestDto {
  @ApiProperty({
    description: 'Display name of the fruit, unique within the farm',
    example: 'Lemon',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

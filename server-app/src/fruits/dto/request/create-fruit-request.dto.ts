import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFruitRequestDto {
  @ApiProperty({
    description: 'Display name of the fruit, unique within the farm',
    example: 'Lemon',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Emoji representing the fruit. Omit to fall back to a generic fruit emoji.',
    example: '🍋',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  icon?: string;
}

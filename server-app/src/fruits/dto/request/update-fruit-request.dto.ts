import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Request shape for PATCH /api/v1/fruits/:id — partial update. All fields
 * are optional so the client can send just `{ active: false }` to
 * deactivate, just `{ name }` to rename, just `{ icon }` to change the
 * emoji, or any combination together.
 */
export class UpdateFruitRequestDto {
  @ApiPropertyOptional({
    description: 'New display name for the fruit, unique within the farm',
    example: 'Lemon',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'New emoji representing the fruit',
    example: '🍋',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Whether the fruit is active',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

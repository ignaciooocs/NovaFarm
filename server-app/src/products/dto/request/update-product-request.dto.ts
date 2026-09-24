import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Request shape for PATCH /api/v1/products/:productId.
 *
 * `active` toca solo la selección de esta farm (su fila en `farmProducts`) y
 * se permite siempre. `name`/`icon` tocan el producto global y solo se
 * aceptan si es de la comunidad, de esta farm, y ninguna jornada lo usa
 * todavía.
 */
export class UpdateProductRequestDto {
  @ApiPropertyOptional({ description: 'New display name', example: 'Murtilla' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'New emoji', example: '🫐' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Whether this farm keeps the product active in its catalog',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

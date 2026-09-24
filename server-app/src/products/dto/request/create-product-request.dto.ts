import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Dos formas de sumar un cultivo al catálogo de la farm, y el body dice cuál:
 * - con `productId`, se agrega uno que ya existe en el catálogo global;
 * - sin él, se crea uno nuevo de la comunidad (visible solo para esta farm)
 *   y se agrega, y ahí `name` es obligatorio.
 */
export class CreateProductRequestDto {
  @ApiPropertyOptional({
    description:
      'Id of an existing catalog product to add to this farm. When present, name and icon are ignored.',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @ApiPropertyOptional({
    description:
      'Display name for a new community product. Required when productId is absent.',
    example: 'Murta',
  })
  @ValidateIf((dto: CreateProductRequestDto) => dto.productId === undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Emoji for a new community product. Omit to fall back to a generic one.',
    example: '🫐',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  icon?: string;
}

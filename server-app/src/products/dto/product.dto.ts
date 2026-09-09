import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProductSource } from '../schemas/product.schema';

/**
 * Un cultivo tal como lo ve una farm: los datos globales del producto más
 * lo que es propio de esta farm (si lo tiene activo, si puede editarlo).
 */
export class ProductDto {
  @ApiProperty({
    description: 'Unique identifier of the product, shared across every farm',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({ description: 'Display name', example: 'Palta' })
  name!: string;

  @ApiProperty({ description: 'Emoji representing the product', example: '🥑' })
  icon!: string;

  @ApiProperty({
    description:
      'APP for products the app ships (visible to every farm), COMMUNITY for one a farm created because the catalog did not cover it (visible only to that farm until promoted).',
    enum: ['APP', 'COMMUNITY'],
    example: 'APP',
  })
  source!: ProductSource;

  @ApiProperty({
    description:
      "Whether this product is offered in onboarding's optional starter step, which shows everything at once in a grid and cannot fit the whole catalog.",
    example: true,
  })
  featured!: boolean;

  @ApiPropertyOptional({
    description:
      'Whether this farm still has the product active in its own catalog. Absent when the product is not in the farm catalog yet.',
    example: true,
  })
  active?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether the name and icon can still be changed. Only ever true for a COMMUNITY product this farm created that no workday uses yet — an APP product belongs to the app, and renaming a used one would rewrite what past workdays say was harvested.',
    example: false,
  })
  editable?: boolean;
}

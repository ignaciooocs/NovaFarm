import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional } from 'class-validator';

export class FindProductRequestDto {
  @ApiPropertyOptional({
    description: 'Filter by whether the farm keeps the product active',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  active?: string;
}

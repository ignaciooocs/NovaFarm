import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class FindWorkdayRequestDto {
  @ApiPropertyOptional({
    description: 'Filter by lifecycle status',
    enum: ['OPEN', 'CLOSED'],
    example: 'OPEN',
  })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}

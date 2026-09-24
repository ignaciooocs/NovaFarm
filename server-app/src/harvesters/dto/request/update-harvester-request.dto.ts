import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request shape for PATCH /api/v1/harvesters/:id — partial update. All
 * fields are optional so the client can send just `{ active: false }` to
 * deactivate, or any subset of the editable fields together.
 */
export class UpdateHarvesterRequestDto {
  @ApiPropertyOptional({
    description: 'New first name of the harvester',
    example: 'Juan',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'New last name of the harvester',
    example: 'Perez',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Optional nickname to help disambiguate harvesters with repeated names. ' +
      'Omit to leave it untouched, or pass null explicitly to clear an existing one.',
    example: 'Juanito',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  nickname?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the harvester is active',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

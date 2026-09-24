import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * One harvester within a POST /api/v1/harvesters/sync batch — a new
 * harvester registered offline in the field.
 */
export class SyncHarvesterEntryDto {
  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) — makes retrying this exact entry idempotent',
    example: 'local-8f3a2b1c',
  })
  @IsString()
  @IsNotEmpty()
  clientEntryId!: string;

  @ApiProperty({
    description: 'First name of the harvester',
    example: 'Juan',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'Last name of the harvester',
    example: 'Perez',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({
    description:
      'Optional nickname to help disambiguate harvesters with repeated names',
    example: 'Juanito',
  })
  @IsOptional()
  @IsString()
  nickname?: string;
}

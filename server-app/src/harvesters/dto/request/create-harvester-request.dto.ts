import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request shape for POST /api/v1/harvesters — quick field registration.
 * Deliberately does NOT accept `nationalId`: that's sensitive PII not
 * collected at quick registration, filled in later by an admin. `farmId`
 * is also excluded — it comes from `@CurrentFarm()`, never client input.
 */
export class CreateHarvesterRequestDto {
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

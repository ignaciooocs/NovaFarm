import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request shape for PATCH /api/v1/users/me — partial update of the
 * caller's own profile. Deliberately does NOT accept `role`, `email`, or
 * `active`: role changes have real edge cases (self-demotion, a farm left
 * with no admin) not designed yet, email is tied to the Firebase identity,
 * and active is an admin-on-someone-else action, not self-service.
 */
export class UpdateUserRequestDto {
  @ApiPropertyOptional({
    description: 'New display name',
    example: 'Juana Perez',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'National ID. Omit to leave it untouched, or pass null explicitly to clear an existing one.',
    example: '12.345.678-9',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  nationalId?: string | null;
}

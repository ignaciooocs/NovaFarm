import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RegisterAdminRequestDto {
  @ApiProperty({
    description: 'Display name of the person registering as admin',
    example: 'Juana Perez',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Display name of the farm being created',
    example: 'Fundo Los Alamos',
  })
  @IsString()
  @IsNotEmpty()
  farmName!: string;

  @ApiProperty({
    description:
      "UI-only classification: whether to show the 'invite your team' step after creation. No backend logic differs between the two values.",
    enum: ['organization', 'independent'],
    example: 'organization',
  })
  @IsIn(['organization', 'independent'])
  farmType!: 'organization' | 'independent';
}

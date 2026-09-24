import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateFarmRequestDto {
  @ApiProperty({
    description: 'Display name of the farm',
    example: 'Fundo Los Alamos',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      "UI-only classification: whether to show the 'invite your team' step after creation. No backend logic differs between the two values.",
    enum: ['organization', 'independent'],
    example: 'organization',
  })
  @IsIn(['organization', 'independent'])
  type!: 'organization' | 'independent';
}

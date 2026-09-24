import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterRecorderRequestDto {
  @ApiProperty({
    description: 'Display name of the person registering as recorder',
    example: 'Pedro Gonzalez',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Invitation code of the farm to join',
    example: 'A1B2C3D4',
  })
  @IsString()
  @IsNotEmpty()
  invitationCode!: string;
}

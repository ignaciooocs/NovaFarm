import { ApiProperty } from '@nestjs/swagger';
import { FarmDto } from '../../../farms/dto';
import { UserDto } from '../../../users/dto';

export class RegisterRecorderResponseDto {
  @ApiProperty({ type: FarmDto })
  farm!: FarmDto;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

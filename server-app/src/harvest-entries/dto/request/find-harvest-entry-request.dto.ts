import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class FindHarvestEntryRequestDto {
  @ApiProperty({
    description: 'Workday to list the delivery entries for',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  @IsMongoId()
  workdayId!: string;
}

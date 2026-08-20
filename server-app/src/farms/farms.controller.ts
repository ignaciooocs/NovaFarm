import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmRequestDto, CreateFarmResponseDto } from './dto';

@ApiTags('farms')
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new farm (tenant root)' })
  @ApiResponse({
    status: 201,
    description: 'The farm was created successfully.',
    type: CreateFarmResponseDto,
  })
  async create(
    @Body() dto: CreateFarmRequestDto,
  ): Promise<CreateFarmResponseDto> {
    return this.farmsService.create(dto);
  }
}

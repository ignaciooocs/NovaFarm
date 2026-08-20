import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { FruitsService } from './fruits.service';
import {
  CreateFruitRequestDto,
  CreateFruitResponseDto,
  FindFruitRequestDto,
  FindFruitResponseDto,
} from './dto';

@ApiTags('fruits')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('fruits')
export class FruitsController {
  constructor(private readonly fruitsService: FruitsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new fruit in the caller farm catalog' })
  @ApiResponse({
    status: 201,
    description: 'The fruit was created successfully.',
    type: CreateFruitResponseDto,
  })
  async create(
    @CurrentFarm() farmId: string,
    @Body() dto: CreateFruitRequestDto,
  ): Promise<CreateFruitResponseDto> {
    return this.fruitsService.create(farmId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the fruits in the caller farm catalog' })
  @ApiResponse({
    status: 200,
    description: 'The list of fruits for the caller farm.',
    type: [FindFruitResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindFruitRequestDto,
  ): Promise<FindFruitResponseDto[]> {
    return this.fruitsService.findAll(farmId, filter);
  }
}

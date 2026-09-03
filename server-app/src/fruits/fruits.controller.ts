import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  UpdateFruitRequestDto,
  UpdateFruitResponseDto,
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

  @Patch(':id')
  @ApiOperation({
    summary:
      'Partially update a fruit in the caller farm catalog (rename and/or activate/deactivate)',
  })
  @ApiResponse({
    status: 200,
    description: 'The fruit was updated successfully.',
    type: UpdateFruitResponseDto,
  })
  async update(
    @CurrentFarm() farmId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFruitRequestDto,
  ): Promise<UpdateFruitResponseDto> {
    const updated = await this.fruitsService.update(farmId, id, dto);
    if (!updated) {
      throw new NotFoundException('Fruit not found in the caller farm catalog');
    }
    return updated;
  }
}

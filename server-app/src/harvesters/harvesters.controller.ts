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
import { HarvestersService } from './harvesters.service';
import {
  CreateHarvesterRequestDto,
  CreateHarvesterResponseDto,
  FindHarvesterRequestDto,
  FindHarvesterResponseDto,
  SyncHarvesterRequestDto,
  SyncHarvesterResponseDto,
  UpdateHarvesterRequestDto,
  UpdateHarvesterResponseDto,
} from './dto';

@ApiTags('harvesters')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('harvesters')
export class HarvestersController {
  constructor(private readonly harvestersService: HarvestersService) {}

  @Post()
  @ApiOperation({
    summary: 'Register a new harvester in the caller farm roster',
  })
  @ApiResponse({
    status: 201,
    description: 'The harvester was created successfully.',
    type: CreateHarvesterResponseDto,
  })
  async create(
    @CurrentFarm() farmId: string,
    @Body() dto: CreateHarvesterRequestDto,
  ): Promise<CreateHarvesterResponseDto> {
    return this.harvestersService.create(farmId, dto);
  }

  @Post('sync')
  @ApiOperation({
    summary:
      'Upload a batch of harvesters registered offline in the field. ' +
      'Always returns 200 with a per-item result.',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-item sync result, one per submitted entry.',
    type: [SyncHarvesterResponseDto],
  })
  async sync(
    @CurrentFarm() farmId: string,
    @Body() dto: SyncHarvesterRequestDto,
  ): Promise<SyncHarvesterResponseDto[]> {
    return this.harvestersService.sync(farmId, dto.entries);
  }

  @Get()
  @ApiOperation({ summary: 'List the harvesters in the caller farm roster' })
  @ApiResponse({
    status: 200,
    description: 'The list of harvesters for the caller farm.',
    type: [FindHarvesterResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindHarvesterRequestDto,
  ): Promise<FindHarvesterResponseDto[]> {
    return this.harvestersService.findAll(farmId, filter);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Partially update a harvester in the caller farm roster (edit and/or activate/deactivate)',
  })
  @ApiResponse({
    status: 200,
    description: 'The harvester was updated successfully.',
    type: UpdateHarvesterResponseDto,
  })
  async update(
    @CurrentFarm() farmId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHarvesterRequestDto,
  ): Promise<UpdateHarvesterResponseDto> {
    const updated = await this.harvestersService.update(farmId, id, dto);
    if (!updated) {
      throw new NotFoundException(
        'Harvester not found in the caller farm roster',
      );
    }
    return updated;
  }
}

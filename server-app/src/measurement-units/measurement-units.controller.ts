import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { MeasurementUnitsService } from './measurement-units.service';
import {
  CreateMeasurementUnitRequestDto,
  CreateMeasurementUnitResponseDto,
  FindMeasurementUnitRequestDto,
  FindMeasurementUnitResponseDto,
} from './dto';

@ApiTags('measurement-units')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('measurement-units')
export class MeasurementUnitsController {
  constructor(
    private readonly measurementUnitsService: MeasurementUnitsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new measurement unit in the caller farm catalog',
  })
  @ApiResponse({
    status: 201,
    description: 'The measurement unit was created successfully.',
    type: CreateMeasurementUnitResponseDto,
  })
  async create(
    @CurrentFarm() farmId: string,
    @Body() dto: CreateMeasurementUnitRequestDto,
  ): Promise<CreateMeasurementUnitResponseDto> {
    return this.measurementUnitsService.create(farmId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List the measurement units in the caller farm catalog',
  })
  @ApiResponse({
    status: 200,
    description: 'The list of measurement units for the caller farm.',
    type: [FindMeasurementUnitResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindMeasurementUnitRequestDto,
  ): Promise<FindMeasurementUnitResponseDto[]> {
    return this.measurementUnitsService.findAll(farmId, filter);
  }
}

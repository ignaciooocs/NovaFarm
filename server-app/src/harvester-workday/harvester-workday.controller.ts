import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { HarvesterWorkdayService } from './harvester-workday.service';
import {
  FindHarvesterWorkdayRequestDto,
  FindHarvesterWorkdayResponseDto,
  SyncHarvesterWorkdayRequestDto,
  SyncHarvesterWorkdayResponseDto,
} from './dto';

@ApiTags('harvester-workday')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('harvester-workday')
export class HarvesterWorkdayController {
  constructor(
    private readonly harvesterWorkdayService: HarvesterWorkdayService,
  ) {}

  @Post('sync')
  @ApiOperation({
    summary:
      'Upload a batch of roster entries captured offline. Always returns ' +
      '200 with a per-item result — rejection (workday not found/closed, ' +
      'harvester not found) is a business outcome, not an HTTP error.',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-item sync result, one per submitted entry.',
    type: [SyncHarvesterWorkdayResponseDto],
  })
  async sync(
    @CurrentFarm() farmId: string,
    @Body() dto: SyncHarvesterWorkdayRequestDto,
  ): Promise<SyncHarvesterWorkdayResponseDto[]> {
    return this.harvesterWorkdayService.sync(
      farmId,
      dto.workdayId,
      dto.entries,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List the roster for a workday' })
  @ApiResponse({
    status: 200,
    description: 'The roster entries for the given workday.',
    type: [FindHarvesterWorkdayResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindHarvesterWorkdayRequestDto,
  ): Promise<FindHarvesterWorkdayResponseDto[]> {
    return this.harvesterWorkdayService.findAll(farmId, filter.workdayId);
  }
}

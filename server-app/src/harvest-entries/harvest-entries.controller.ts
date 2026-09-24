import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { HarvestEntriesService } from './harvest-entries.service';
import {
  FindHarvestEntryRequestDto,
  FindHarvestEntryResponseDto,
  SyncHarvestEntryRequestDto,
  SyncHarvestEntryResponseDto,
} from './dto';

@ApiTags('harvest-entries')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('harvest-entries')
export class HarvestEntriesController {
  constructor(private readonly harvestEntriesService: HarvestEntriesService) {}

  @Post('sync')
  @ApiOperation({
    summary:
      'Upload a batch of delivery entries ("Anotar") captured offline. ' +
      'Always returns 200 with a per-item result — rejection (workday not ' +
      'found/closed, harvester not found/not on roster, unit not found) is ' +
      'a business outcome, not an HTTP error.',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-item sync result, one per submitted entry.',
    type: [SyncHarvestEntryResponseDto],
  })
  async sync(
    @CurrentFarm() farmId: string,
    @Body() dto: SyncHarvestEntryRequestDto,
  ): Promise<SyncHarvestEntryResponseDto[]> {
    return this.harvestEntriesService.sync(farmId, dto.workdayId, dto.entries);
  }

  @Get()
  @ApiOperation({ summary: 'List the delivery entries for a workday' })
  @ApiResponse({
    status: 200,
    description: 'The delivery entries for the given workday.',
    type: [FindHarvestEntryResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindHarvestEntryRequestDto,
  ): Promise<FindHarvestEntryResponseDto[]> {
    return this.harvestEntriesService.findAll(farmId, filter.workdayId);
  }
}

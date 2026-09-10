import {
  Body,
  Controller,
  Get,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import type { AuthenticatedUser } from '../auth/guards/farm-scope.guard';
import { WorkdaysService } from './workdays.service';
import {
  CloseWorkdayResponseDto,
  CreateWorkdayRequestDto,
  CreateWorkdayResponseDto,
  FindWorkdayRequestDto,
  FindWorkdayResponseDto,
  UpdateWorkdayPayRequestDto,
  UpdateWorkdayPayResponseDto,
} from './dto';

@ApiTags('workdays')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('workdays')
export class WorkdaysController {
  constructor(private readonly workdaysService: WorkdaysService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new workday for the caller farm' })
  @ApiResponse({
    status: 201,
    description: 'The workday was opened successfully.',
    type: CreateWorkdayResponseDto,
  })
  async create(
    @CurrentFarm() farmId: string,
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateWorkdayRequestDto,
  ): Promise<CreateWorkdayResponseDto> {
    return this.workdaysService.create(farmId, authUser, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the workdays for the caller farm' })
  @ApiResponse({
    status: 200,
    description: 'The list of workdays for the caller farm.',
    type: [FindWorkdayResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindWorkdayRequestDto,
  ): Promise<FindWorkdayResponseDto[]> {
    return this.workdaysService.findAll(farmId, filter);
  }

  @Patch(':id/pay')
  @ApiOperation({
    summary:
      'Define or correct how much is paid in an open workday (rejected once it is closed)',
  })
  @ApiResponse({
    status: 200,
    description: 'The workday pay was updated successfully.',
    type: UpdateWorkdayPayResponseDto,
  })
  async updatePay(
    @CurrentFarm() farmId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkdayPayRequestDto,
  ): Promise<UpdateWorkdayPayResponseDto> {
    return this.workdaysService.updatePay(farmId, id, dto);
  }

  @Patch(':id/close')
  @ApiOperation({
    summary: 'Close a workday, freezing its aggregate total in kilos (RF-01.2)',
  })
  @ApiResponse({
    status: 200,
    description: 'The workday was closed successfully.',
    type: CloseWorkdayResponseDto,
  })
  async close(
    @CurrentFarm() farmId: string,
    @Param('id') id: string,
  ): Promise<CloseWorkdayResponseDto> {
    return this.workdaysService.close(farmId, id);
  }
}

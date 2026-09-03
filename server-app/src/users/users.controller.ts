import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import { FindUserRequestDto, FindUserResponseDto } from './dto';

// Solo admin: a diferencia de los catálogos (fruits/harvesters/...), ver el
// equipo de la farm expone datos de otras cuentas (email, rol, estado) que
// un recorder no debería poder listar. Primer uso real de RolesGuard en el
// proyecto.
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller farm's team (admin only)",
  })
  @ApiResponse({
    status: 200,
    description: 'The list of users for the caller farm.',
    type: [FindUserResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindUserRequestDto,
  ): Promise<FindUserResponseDto[]> {
    return this.usersService.findAll(farmId, filter);
  }
}

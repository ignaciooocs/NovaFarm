import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
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
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/guards/farm-scope.guard';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import {
  FindUserRequestDto,
  FindUserResponseDto,
  UpdateUserRequestDto,
  UpdateUserResponseDto,
  UpdateUserRolesRequestDto,
} from './dto';

// Solo admin por defecto: a diferencia de los catálogos (fruits/harvesters/
// ...), ver el equipo de la farm expone datos de otras cuentas (email, rol,
// estado) que un recorder no debería poder listar. Primer uso real de
// RolesGuard en el proyecto. Las rutas /me son la excepción explícita —
// cualquiera puede ver/editar su propio perfil, sea cual sea su rol — así
// que sobreescriben el @Roles('admin') de la clase con su propio @Roles(),
// listando los tres roles explícitamente (bug real, 2026-09-04: al agregar
// 'supervisor' se actualizó findAll() pero no /me, así que un supervisor
// recién ascendido se encontraba con un 403 apenas abría Perfil).
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'supervisor')
  @ApiOperation({
    summary:
      "List the caller farm's team (admin and supervisor — read-only for the latter)",
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

  @Get('me')
  @Roles('admin', 'recorder', 'supervisor')
  @ApiOperation({ summary: "Get the caller's own user profile" })
  @ApiResponse({
    status: 200,
    description: 'The caller user.',
    type: FindUserResponseDto,
  })
  async findMe(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<FindUserResponseDto> {
    const user = await this.usersService.findMe(authUser.uid);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Patch('me')
  @Roles('admin', 'recorder', 'supervisor')
  @ApiOperation({
    summary:
      "Update the caller's own user profile (name and/or nationalId only)",
  })
  @ApiResponse({
    status: 200,
    description: 'The user was updated successfully.',
    type: UpdateUserResponseDto,
  })
  async updateMe(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<UpdateUserResponseDto> {
    const updated = await this.usersService.updateMe(authUser.uid, dto);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return updated;
  }

  @Patch(':id/roles')
  @Roles('admin')
  @ApiOperation({
    summary:
      "Reassign a team member's recorder/supervisor roles (admin only). Never " +
      'grants/revokes admin itself — if the target is already an admin, that ' +
      'role is preserved and this only adds/removes recorder/supervisor on top of it.',
  })
  @ApiResponse({
    status: 200,
    description: "The user's roles were updated successfully.",
    type: UpdateUserResponseDto,
  })
  async updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesRequestDto,
    @CurrentFarm() farmId: string,
  ): Promise<UpdateUserResponseDto> {
    return this.usersService.updateRoles(id, farmId, dto.roles);
  }
}

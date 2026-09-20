import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { FarmsService } from './farms.service';
import {
  CreateFarmRequestDto,
  CreateFarmResponseDto,
  FindFarmResponseDto,
  RegenerateFarmInvitationCodeResponseDto,
  UpdateFarmRequestDto,
  UpdateFarmResponseDto,
} from './dto';

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

  // Sin :id en la URL a propósito: siempre es "mi propia farm", nunca una
  // arbitraria — @CurrentFarm() ya la resuelve del token, así que no hay
  // forma de pedir la farm de otra persona por más que se intente.
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(FarmScopeGuard)
  @ApiOperation({ summary: "Get the caller's own farm" })
  @ApiResponse({
    status: 200,
    description: 'The caller farm.',
    type: FindFarmResponseDto,
  })
  async findMe(@CurrentFarm() farmId: string): Promise<FindFarmResponseDto> {
    const farm = await this.farmsService.findById(farmId);
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }
    return farm;
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(FarmScopeGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary:
      "Update the caller's own farm settings (admin only) — currently just recordersCanManageCatalog",
  })
  @ApiResponse({
    status: 200,
    description: 'The farm was updated successfully.',
    type: UpdateFarmResponseDto,
  })
  async updateMe(
    @CurrentFarm() farmId: string,
    @Body() dto: UpdateFarmRequestDto,
  ): Promise<UpdateFarmResponseDto> {
    const updated = await this.farmsService.update(farmId, dto);
    if (!updated) {
      throw new NotFoundException('Farm not found');
    }
    return updated;
  }

  // Ruta propia y no un campo más de PATCH /farms/me: el código lo genera
  // el server, nunca lo manda el cliente (ver ValidationPipe en main.ts).
  // 200 y no 201: no crea un recurso, reemplaza el código de la farm.
  @Post('me/invitation-code')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(FarmScopeGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary:
      "Generate a new invitation code for the caller's own farm (admin only), valid for one hour. The previous code stops working immediately.",
  })
  @ApiResponse({
    status: 200,
    description: 'The farm with its new invitation code and expiry.',
    type: RegenerateFarmInvitationCodeResponseDto,
  })
  async regenerateInvitationCode(
    @CurrentFarm() farmId: string,
  ): Promise<RegenerateFarmInvitationCodeResponseDto> {
    const updated = await this.farmsService.regenerateInvitationCode(farmId);
    if (!updated) {
      throw new NotFoundException('Farm not found');
    }
    return updated;
  }
}

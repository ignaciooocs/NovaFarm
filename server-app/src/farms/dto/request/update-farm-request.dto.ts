import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Request shape for PATCH /api/v1/farms/me — partial update, admin only.
 * Only the recordersCanManageCatalog switch is editable here for now;
 * renaming the farm isn't built yet. A new invitationCode has its own route
 * (POST /farms/me/invitation-code): the server generates it, never the client.
 */
export class UpdateFarmRequestDto {
  @ApiPropertyOptional({
    description:
      'Whether recorders (not just admins) can view/manage the farm catalog',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  recordersCanManageCatalog?: boolean;
}

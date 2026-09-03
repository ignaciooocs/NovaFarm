import { FarmDto } from '../farm.dto';

/**
 * Response shape for PATCH /api/v1/farms/me.
 * Extends FarmDto directly — the updated farm's full canonical shape is
 * exactly what the client needs back, no divergence/wrapper required.
 */
export class UpdateFarmResponseDto extends FarmDto {}

import { FarmDto } from '../farm.dto';

/**
 * Response shape for GET /api/v1/farms/me.
 * Extends FarmDto directly — the caller's own farm's full canonical shape
 * is exactly what the client needs back, no divergence/wrapper required.
 */
export class FindFarmResponseDto extends FarmDto {}

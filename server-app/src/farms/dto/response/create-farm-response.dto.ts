import { FarmDto } from '../farm.dto';

/**
 * Response shape for POST /api/v1/farms.
 * Extends FarmDto directly since the created farm's full canonical shape
 * is exactly what the client needs back — no divergence/wrapper required.
 */
export class CreateFarmResponseDto extends FarmDto {}

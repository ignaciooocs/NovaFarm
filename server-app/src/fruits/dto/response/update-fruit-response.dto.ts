import { FruitDto } from '../fruit.dto';

/**
 * Response shape for PATCH /api/v1/fruits/:id.
 * Extends FruitDto directly since the updated fruit's full canonical shape
 * is exactly what the client needs back — no divergence/wrapper required.
 */
export class UpdateFruitResponseDto extends FruitDto {}

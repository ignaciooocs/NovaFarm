import { FruitDto } from '../fruit.dto';

/**
 * Response shape for POST /api/v1/fruits.
 * Extends FruitDto directly since the created fruit's full canonical shape
 * is exactly what the client needs back — no divergence/wrapper required.
 */
export class CreateFruitResponseDto extends FruitDto {}

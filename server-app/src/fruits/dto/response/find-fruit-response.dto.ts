import { FruitDto } from '../fruit.dto';

/**
 * Response shape for a single item in GET /api/v1/fruits.
 * Extends FruitDto directly — the listing returns each fruit's full
 * canonical shape, no divergence/wrapper required.
 */
export class FindFruitResponseDto extends FruitDto {}

import { ProductDto } from '../product.dto';

/**
 * Response shape for the update operation on /api/v1/products. Extends
 * ProductDto directly — the canonical shape is exactly what the client
 * needs back, no divergence required.
 */
export class UpdateProductResponseDto extends ProductDto {}

import { HarvesterDto } from '../harvester.dto';

/**
 * Response shape for PATCH /api/v1/harvesters/:id.
 * Extends HarvesterDto directly since the updated harvester's full canonical
 * shape is exactly what the client needs back — no divergence/wrapper required.
 */
export class UpdateHarvesterResponseDto extends HarvesterDto {}

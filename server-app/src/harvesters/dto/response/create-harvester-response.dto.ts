import { HarvesterDto } from '../harvester.dto';

/**
 * Response shape for POST /api/v1/harvesters.
 * Extends HarvesterDto directly since the created harvester's full canonical
 * shape is exactly what the client needs back — no divergence/wrapper
 * required. `nationalId` is never included (see HarvesterDto).
 */
export class CreateHarvesterResponseDto extends HarvesterDto {}

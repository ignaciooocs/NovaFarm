import { HarvesterDto } from '../harvester.dto';

/**
 * Response shape for a single item in GET /api/v1/harvesters.
 * Extends HarvesterDto directly — the listing returns each harvester's full
 * canonical shape, no divergence/wrapper required. `nationalId` is never
 * included (see HarvesterDto).
 */
export class FindHarvesterResponseDto extends HarvesterDto {}

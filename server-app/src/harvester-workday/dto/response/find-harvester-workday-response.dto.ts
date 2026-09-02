import { HarvesterWorkdayDto } from '../harvester-workday.dto';

/**
 * Response shape for a single item in GET /api/v1/harvester-workday.
 * Extends HarvesterWorkdayDto directly — the listing returns each roster
 * entry's full canonical shape, no divergence/wrapper required.
 */
export class FindHarvesterWorkdayResponseDto extends HarvesterWorkdayDto {}

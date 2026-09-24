import { HarvestEntryDto } from '../harvest-entry.dto';

/**
 * Response shape for a single item in GET /api/v1/harvest-entries.
 * Extends HarvestEntryDto directly — the listing returns each entry's full
 * canonical shape, no divergence/wrapper required.
 */
export class FindHarvestEntryResponseDto extends HarvestEntryDto {}

import { WorkdayDto } from '../workday.dto';

/**
 * Response shape for a single item in GET /api/v1/workdays.
 * Extends WorkdayDto directly — the listing returns each workday's full
 * canonical shape, no divergence/wrapper required.
 */
export class FindWorkdayResponseDto extends WorkdayDto {}

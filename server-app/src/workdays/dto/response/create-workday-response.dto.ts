import { WorkdayDto } from '../workday.dto';

/**
 * Response shape for POST /api/v1/workdays.
 * Extends WorkdayDto directly since the opened workday's full canonical
 * shape is exactly what the client needs back — no divergence/wrapper
 * required.
 */
export class CreateWorkdayResponseDto extends WorkdayDto {}

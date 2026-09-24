import { WorkdayDto } from '../workday.dto';

/**
 * Response shape for PATCH /api/v1/workdays/:id/close.
 * Extends WorkdayDto directly — the closed workday's full canonical shape,
 * including the newly frozen `finalTotalKg` (RF-01.2), is exactly what the
 * client needs back.
 */
export class CloseWorkdayResponseDto extends WorkdayDto {}

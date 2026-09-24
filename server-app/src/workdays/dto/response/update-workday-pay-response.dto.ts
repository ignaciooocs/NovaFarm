import { WorkdayDto } from '../workday.dto';

/**
 * Response shape for PATCH /api/v1/workdays/:id/pay.
 * Extends WorkdayDto directly — igual que create/close, la jornada completa
 * ya actualizada es exactamente lo que el cliente necesita de vuelta.
 */
export class UpdateWorkdayPayResponseDto extends WorkdayDto {}

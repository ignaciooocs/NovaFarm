import { MeasurementUnitDto } from '../measurement-unit.dto';

/**
 * Response shape for PATCH /api/v1/measurement-units/:id.
 * Extends MeasurementUnitDto directly since the updated unit's full
 * canonical shape is exactly what the client needs back — no
 * divergence/wrapper required.
 */
export class UpdateMeasurementUnitResponseDto extends MeasurementUnitDto {}

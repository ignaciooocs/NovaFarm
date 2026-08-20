import { MeasurementUnitDto } from '../measurement-unit.dto';

/**
 * Response shape for POST /api/v1/measurement-units.
 * Extends MeasurementUnitDto directly since the created measurement unit's
 * full canonical shape is exactly what the client needs back — no
 * divergence/wrapper required.
 */
export class CreateMeasurementUnitResponseDto extends MeasurementUnitDto {}

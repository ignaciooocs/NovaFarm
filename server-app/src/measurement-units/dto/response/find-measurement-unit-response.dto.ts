import { MeasurementUnitDto } from '../measurement-unit.dto';

/**
 * Response shape for a single item in GET /api/v1/measurement-units.
 * Extends MeasurementUnitDto directly — the listing returns each unit's
 * full canonical shape, no divergence/wrapper required.
 */
export class FindMeasurementUnitResponseDto extends MeasurementUnitDto {}

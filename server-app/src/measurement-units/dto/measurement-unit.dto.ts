import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MeasurementUnitMode } from '../schemas/measurement-unit.schema';

/**
 * Canonical shape of a MeasurementUnit entity, independent of any specific
 * action. Request/response DTOs for individual actions are typed against
 * this class.
 */
export class MeasurementUnitDto {
  @ApiProperty({
    description: 'Unique identifier of the measurement unit',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this measurement unit belongs to (scoped per farm)',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Display name of the unit, unique within the farm',
    example: 'Crate 10kg',
  })
  name!: string;

  @ApiProperty({
    description:
      'How deliveries with this unit are captured. COUNT: fixed-weight container, the recorder counts containers and kilos come from kgFactor. WEIGHT: the container is weighed every round, each entry is one container and the kilos come from the scale.',
    enum: ['COUNT', 'WEIGHT'],
    example: 'COUNT',
  })
  mode!: MeasurementUnitMode;

  // `type: Number` explícito: el plugin de Swagger no logra inferirlo desde
  // `number | null` y cae a `object`, lo que le genera a ui-app un
  // `{ [key: string]: unknown }` en vez de un número.
  @ApiPropertyOptional({
    description:
      'Conversion factor to kilos (e.g. a 10kg crate is 10). Set only in COUNT mode; null for WEIGHT units.',
    type: Number,
    example: 10,
    nullable: true,
  })
  kgFactor?: number | null;

  @ApiProperty({
    description: 'Whether the measurement unit is active',
    example: true,
  })
  active!: boolean;
}

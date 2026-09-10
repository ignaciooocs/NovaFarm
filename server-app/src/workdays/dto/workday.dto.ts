import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WorkdayPayBasis } from '../schemas/workday.schema';

/**
 * Canonical shape of a Workday entity, independent of any specific action.
 * Request/response DTOs for individual actions are typed against this class.
 */
export class WorkdayDto {
  @ApiProperty({
    description: 'Unique identifier of the workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id!: string;

  @ApiProperty({
    description: 'Farm this workday belongs to',
    example: '64f1a2b3c4d5e6f7a8b9c0d0',
  })
  farmId!: string;

  @ApiProperty({
    description: 'Date this workday covers (ISO 8601)',
    example: '2026-09-02T00:00:00.000Z',
  })
  date!: string;

  @ApiProperty({
    description: 'Product being harvested this workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d2',
  })
  productId!: string;

  @ApiProperty({
    description: 'Default measurement unit for entries recorded this workday',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  defaultMeasurementUnitId!: string;

  @ApiProperty({
    description: 'Lifecycle status of the workday',
    enum: ['OPEN', 'CLOSED'],
    example: 'OPEN',
  })
  status!: 'OPEN' | 'CLOSED';

  @ApiProperty({
    description: 'When the workday was opened (ISO 8601)',
    example: '2026-09-02T08:00:00.000Z',
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description:
      'Frozen aggregate total in kilos, computed and set when the workday is closed (RF-01.2)',
    example: 128.5,
  })
  finalTotalKg?: number;

  @ApiProperty({
    description:
      'Recorder attributed to this workday, or null for guest mode (opened by an admin, not tied to a specific recorder)',
    example: '64f1a2b3c4d5e6f7a8b9c0d4',
    type: String,
    nullable: true,
  })
  recorderId!: string | null;

  @ApiPropertyOptional({
    description:
      'Display name of the recorder attributed to this workday. Absent for guest-mode workdays (recorderId is null).',
    example: 'Juan Pérez',
  })
  recorderName?: string;

  // `type: Number` explícito por lo mismo que kgFactor en MeasurementUnitDto:
  // el plugin de Swagger no infiere `number | null` y cae a `object`, lo que
  // le genera a ui-app un `{ [key: string]: unknown }` en vez de un número.
  @ApiPropertyOptional({
    description:
      'How much a harvester is paid for what they deliver this workday, in whole Chilean pesos. Null when the farm does not pay per production (day wage) or has not defined the rate yet.',
    type: Number,
    example: 500,
    nullable: true,
  })
  payRate?: number | null;

  @ApiPropertyOptional({
    description:
      'What the pay rate is applied to. PER_UNIT: per container delivered (only valid with a COUNT unit). PER_KG: per kilo, the only option when the container is weighed every round (WEIGHT). Null whenever payRate is null.',
    enum: ['PER_UNIT', 'PER_KG'],
    example: 'PER_UNIT',
    nullable: true,
  })
  payBasis?: WorkdayPayBasis | null;

  @ApiProperty({
    description:
      'Client-generated id (the originating local workday row id) used to make retrying POST /workdays idempotent',
    example: 'local-8f3a2b1c',
  })
  clientEntryId!: string;
}

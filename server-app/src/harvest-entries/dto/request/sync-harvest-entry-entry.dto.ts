import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  NotEquals,
  ValidateIf,
} from 'class-validator';

/**
 * One delivery entry within a POST /api/v1/harvest-entries/sync batch.
 */
export class SyncHarvestEntryEntryDto {
  @ApiProperty({
    description:
      'Client-generated id (the originating SQLite row id) — makes retrying this exact entry idempotent',
    example: 'local-4d2e9a7f',
  })
  @IsString()
  @IsNotEmpty()
  clientEntryId!: string;

  @ApiProperty({
    description:
      'Harvester who made this delivery (must exist, be active, and already be on the workday roster)',
    example: '64f1a2b3c4d5e6f7a8b9c0d3',
  })
  @IsMongoId()
  harvesterId!: string;

  @ApiProperty({
    description:
      'Measurement unit used for this entry (must exist and be active in the caller farm catalog)',
    example: '64f1a2b3c4d5e6f7a8b9c0d4',
  })
  @IsMongoId()
  measurementUnitId!: string;

  @ApiProperty({
    description:
      'How many containers this delivery is — always a whole number of containers, never kilos. In WEIGHT mode a delivery is one weighed container, so this is 1. Negative values are corrections (RF-02.3, e.g. the -1 button undoing a mis-tap) — never zero.',
    example: 3,
  })
  // Entero desde que el modo de la unidad es explícito: `unitCount` son
  // envases y nada más. Antes una anotación en pesaje directo lo usaba para
  // meter los kilos (22.1), y por eso tenía que aceptar decimales.
  @IsInt()
  @NotEquals(0)
  unitCount!: number;

  @ApiPropertyOptional({
    description:
      'Weight read off the scale for this delivery, in kilos, at most one decimal. Required for WEIGHT units; ignored for COUNT ones, which get their kilos from the unit kgFactor instead. Always positive: the sign of the entry comes from unitCount.',
    example: 22.1,
  })
  // Solo se valida cuando viene: si la unidad es WEIGHT y falta, el service
  // rechaza esa entrada del batch con su razón (no un 400 que voltee todo
  // el batch, ver sync()).
  @ValidateIf((dto: SyncHarvestEntryEntryDto) => dto.weightKg !== undefined)
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  weightKg?: number;

  // `type: Number` + nullable explícitos: sin eso Swagger no infiere
  // `number | null` y le genera a ui-app un tipo que no acepta el null.
  @ApiPropertyOptional({
    description:
      'Actual weight of this delivery in kilos, at most one decimal — an optional control reading for COUNT units (the container is worth 3kg by catalog, this one really weighed 3.4). Rejected for WEIGHT units, where the scale reading is already weightKg. Never affects totalKg or the pay. The device is the only writer of this field, so it always sends its local value: a number sets it, **null clears it** (the recorder removed a weight they had recorded), and omitting it leaves whatever is stored untouched.',
    type: Number,
    example: 3.4,
    nullable: true,
  })
  // null pasa sin validar: es un valor con significado propio (sacar el
  // peso), no un peso mal formado.
  @ValidateIf(
    (dto: SyncHarvestEntryEntryDto) =>
      dto.measuredKg !== undefined && dto.measuredKg !== null,
  )
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  measuredKg?: number | null;

  @ApiProperty({
    description:
      'When the delivery actually happened on-device (ISO 8601), not when it is synced',
    example: '2026-09-02T09:15:00.000Z',
  })
  @IsDateString()
  recordedAt!: string;
}

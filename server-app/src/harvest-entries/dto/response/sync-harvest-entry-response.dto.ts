import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ErrorCode } from '../../../common/errors/error-codes';

/**
 * Per-item result for POST /api/v1/harvest-entries/sync. Standalone shape
 * (not extending HarvestEntryDto) — this describes a sync operation's
 * outcome, not the entity itself. Always returned with HTTP 200, even when
 * every item is rejected — rejection is a business outcome the client needs
 * to see per-item, not an HTTP error (see arquitectura.md §2).
 */
export class SyncHarvestEntryResponseDto {
  @ApiProperty({
    description: 'Echoes the clientEntryId this result corresponds to',
    example: 'local-4d2e9a7f',
  })
  clientEntryId!: string;

  @ApiProperty({
    description: 'Outcome of this entry',
    enum: ['created', 'already-synced', 'rejected'],
    example: 'created',
  })
  status!: 'created' | 'already-synced' | 'rejected';

  @ApiPropertyOptional({
    description: 'Present when status is "rejected"',
    example: 'Harvester not found in the caller farm roster',
  })
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Código estable del rechazo, presente cuando status es "rejected". Es el contrato con el cliente: el de reason es texto en inglés para el log. Valores en common/errors/error-codes.ts.',
    example: 'WORKDAY_CLOSED',
  })
  reasonCode?: ErrorCode;

  @ApiPropertyOptional({
    description: 'Server-assigned id, present when status is not "rejected"',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  _id?: string;
}

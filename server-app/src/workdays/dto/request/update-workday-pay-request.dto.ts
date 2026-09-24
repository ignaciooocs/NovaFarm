import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsPositive, ValidateIf } from 'class-validator';
import type { WorkdayPayBasis } from '../../schemas/workday.schema';

/**
 * Request shape for PATCH /api/v1/workdays/:id/pay — define o corrige cuánto
 * se paga en una jornada que sigue abierta.
 *
 * Existe como endpoint propio (no un PATCH genérico sobre la jornada) por lo
 * mismo que `:id/close`: acota qué se puede editar después de abrir. La
 * fecha, el cultivo y la unidad de la jornada no se tocan — cambiar
 * cualquiera de esos reescribiría lo que las entregas ya anotadas
 * significan. El pago no: es un precio aplicado sobre esas mismas entregas.
 */
export class UpdateWorkdayPayRequestDto {
  // `type: Number` explícito: sin eso Swagger cae a `object` para
  // `number | null` (mismo caso que kgFactor/recorderId).
  @ApiProperty({
    description:
      'How much a harvester is paid for what they deliver this workday, in whole Chilean pesos. Send null to clear the pay entirely (payBasis is cleared with it).',
    type: Number,
    example: 500,
    nullable: true,
  })
  // Con payRate en null no se valida nada más: es "sacar la tarifa", y el
  // service se encarga de dejar payBasis en null junto con ella.
  @ValidateIf((dto: UpdateWorkdayPayRequestDto) => dto.payRate !== null)
  @IsInt()
  @IsPositive()
  payRate!: number | null;

  @ApiPropertyOptional({
    description:
      'What the pay rate is applied to. Required whenever payRate is not null; PER_UNIT is rejected for a WEIGHT unit. Ignored when clearing the pay.',
    enum: ['PER_UNIT', 'PER_KG'],
    example: 'PER_UNIT',
  })
  @ValidateIf((dto: UpdateWorkdayPayRequestDto) => dto.payRate !== null)
  @IsIn(['PER_UNIT', 'PER_KG'])
  payBasis?: WorkdayPayBasis | null;
}

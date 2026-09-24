import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model, Types } from 'mongoose';
import type { ErrorCode } from '../common/errors/error-codes';
import { logSyncBatch } from '../common/logging/sync-batch-log';
import { HarvesterWorkdayService } from '../harvester-workday/harvester-workday.service';
import { HarvestersService } from '../harvesters/harvesters.service';
import { MeasurementUnitDto } from '../measurement-units/dto';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { WorkdaysService } from '../workdays/workdays.service';
import {
  HarvestEntry,
  HarvestEntryDocument,
} from './schemas/harvest-entry.schema';
import {
  HarvestEntryDto,
  SyncHarvestEntryEntryDto,
  SyncHarvestEntryResponseDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Maneja las entregas de cosecha ("Anotar") de una jornada — el equivalente
 * digital de una marca en la libreta de papel. Igual que harvester-workday,
 * esto se sincroniza en batch desde datos capturados offline, no es un CRUD
 * en vivo.
 */
@Injectable()
export class HarvestEntriesService {
  constructor(
    @InjectModel(HarvestEntry.name)
    private readonly harvestEntryModel: Model<HarvestEntry>,
    private readonly harvestersService: HarvestersService,
    private readonly measurementUnitsService: MeasurementUnitsService,
    private readonly workdaysService: WorkdaysService,
    private readonly harvesterWorkdayService: HarvesterWorkdayService,
  ) {}

  // Sube un batch de entregas capturadas offline. Primero valida la jornada
  // una sola vez: si no existe o ya está cerrada, rechaza TODO el batch sin
  // gastar una consulta por ítem. Devuelve un resultado por entrada
  // (created/already-synced/rejected), nunca un error HTTP.
  //
  // **Todo se resuelve por lote, no por entrada** (reescrito el 2026-09-09,
  // por un bug real en dispositivo): antes cada anotación costaba ~5 idas a
  // Atlas en serie —¿ya existe?, cosechador, roster, unidad, insert— así que
  // un día completo (98 anotaciones) eran ~490 consultas encadenadas, más de
  // los 15s de timeout del cliente. La petición moría siempre en el mismo
  // punto y las anotaciones no bajaban nunca del contador de pendientes.
  // Ahora son ~5 consultas para todo el lote, sea de 1 o de 500.
  async sync(
    farmId: string,
    workdayId: string,
    entries: SyncHarvestEntryEntryDto[],
  ): Promise<SyncHarvestEntryResponseDto[]> {
    const startedAt = Date.now();
    const scope = 'harvest-entries';
    const context = `workday=${workdayId}`;
    const workday = await this.workdaysService.findById(farmId, workdayId);

    if (!workday) {
      const rejectedAll = entries.map((entry) =>
        this.rejected(
          entry.clientEntryId,
          'WORKDAY_NOT_FOUND',
          'Workday not found',
        ),
      );
      logSyncBatch(scope, context, rejectedAll, startedAt);
      return rejectedAll;
    }

    if (workday.status === 'CLOSED') {
      const rejectedAll = entries.map((entry) =>
        this.rejected(
          entry.clientEntryId,
          'WORKDAY_CLOSED',
          'Workday is already closed',
        ),
      );
      logSyncBatch(scope, context, rejectedAll, startedAt);
      return rejectedAll;
    }

    const workdayObjectId = new Types.ObjectId(workdayId);
    const [existingDocs, activeHarvesterIds, rosterHarvesterIds, units] =
      await Promise.all([
        this.harvestEntryModel
          .find({
            workdayId: workdayObjectId,
            clientEntryId: { $in: entries.map((entry) => entry.clientEntryId) },
          })
          .exec(),
        this.harvestersService.findActiveIdsIn(
          farmId,
          entries.map((entry) => entry.harvesterId),
        ),
        this.harvesterWorkdayService.findRosterHarvesterIds(farmId, workdayId),
        // El catálogo entero de la farm en vez de una consulta por unidad:
        // son un puñado de filas, y una jornada usa una o dos.
        this.measurementUnitsService.findAll(farmId, { active: true }),
      ]);

    const existingByClientEntryId = new Map(
      existingDocs.map((doc) => [doc.clientEntryId, doc]),
    );
    const unitsById = new Map(units.map((unit) => [unit._id, unit]));

    const results: SyncHarvestEntryResponseDto[] = [];
    const operations: AnyBulkWriteOperation<HarvestEntry>[] = [];
    const creating: string[] = [];

    for (const entry of entries) {
      const existing = existingByClientEntryId.get(entry.clientEntryId);
      if (existing) {
        // Lo único que un reintento puede cambiar de una anotación ya
        // sincronizada es el peso de control (ver el schema): los envases y
        // los kilos del total quedan intactos.
        //
        // `null` **también se escribe**: significa que el anotador le sacó
        // el peso que le había puesto. Antes se ignoraba (solo se escribía
        // si el campo traía número), así que quitar un peso lo borraba de la
        // pantalla pero lo dejaba vivo en la base — bug real, encontrado
        // mirando Atlas el 2026-09-09. El celular es el único que escribe
        // este campo, así que su valor local es la verdad, null incluido.
        if (entry.measuredKg !== undefined) {
          const stored = existing.measuredKg
            ? Number(existing.measuredKg.toString())
            : null;

          // Solo si de verdad cambió: un reintento del mismo lote no tiene
          // por qué reescribir lo que ya está igual.
          if (stored !== entry.measuredKg) {
            operations.push({
              updateOne: {
                filter: { _id: existing._id },
                update: {
                  $set: {
                    measuredKg:
                      entry.measuredKg === null
                        ? null
                        : Types.Decimal128.fromString(
                            entry.measuredKg.toString(),
                          ),
                  },
                },
              },
            });
          }
        }

        results.push({
          clientEntryId: entry.clientEntryId,
          status: 'already-synced',
          _id: existing._id.toString(),
        });
        continue;
      }

      if (!activeHarvesterIds.has(entry.harvesterId)) {
        results.push(
          this.rejected(
            entry.clientEntryId,
            'HARVESTER_NOT_FOUND',
            'Harvester not found in the caller farm roster',
          ),
        );
        continue;
      }

      if (!rosterHarvesterIds.has(entry.harvesterId)) {
        results.push(
          this.rejected(
            entry.clientEntryId,
            'HARVESTER_NOT_IN_ROSTER',
            'Harvester is not on this workday roster',
          ),
        );
        continue;
      }

      const measurementUnit = unitsById.get(entry.measurementUnitId);
      if (!measurementUnit) {
        results.push(
          this.rejected(
            entry.clientEntryId,
            'UNIT_NOT_FOUND',
            'Measurement unit not found in the caller farm catalog',
          ),
        );
        continue;
      }

      // En una unidad WEIGHT el peso real ya es el total de la entrega
      // (weightKg): aceptar además un measuredKg dejaría dos campos peleando
      // por significar lo mismo, que es justo la ambigüedad que el `mode`
      // explícito vino a matar.
      // `!= null` y no `!== undefined`: el cliente manda el campo en todas
      // sus anotaciones (mandar null es como dice "sin peso"), así que
      // comparar contra undefined rechazaría **toda** entrega hecha con un
      // envase que se pesa.
      if (entry.measuredKg != null && measurementUnit.mode === 'WEIGHT') {
        results.push(
          this.rejected(
            entry.clientEntryId,
            'MEASURED_KG_NOT_ALLOWED',
            'measuredKg only applies to COUNT units — a WEIGHT unit already carries its real weight in weightKg',
          ),
        );
        continue;
      }

      const totalKg = this.resolveTotalKg(entry, measurementUnit);
      if (totalKg === null) {
        results.push(
          measurementUnit.mode === 'WEIGHT'
            ? this.rejected(
                entry.clientEntryId,
                'WEIGHT_KG_REQUIRED',
                'weightKg is required for entries made with a WEIGHT measurement unit',
              )
            : this.rejected(
                entry.clientEntryId,
                'UNIT_KG_FACTOR_MISSING',
                'Measurement unit has no kgFactor configured',
              ),
        );
        continue;
      }

      // upsert sobre {workdayId, clientEntryId} — el mismo índice único que
      // antes hacía idempotente el create(), ahora sin una consulta previa
      // por entrada. $setOnInsert y no $set: si la fila ya existiera (una
      // carrera entre dos reintentos), no se le pisa nada de lo ya guardado.
      operations.push({
        updateOne: {
          filter: {
            workdayId: workdayObjectId,
            clientEntryId: entry.clientEntryId,
          },
          update: {
            $setOnInsert: {
              farmId: new Types.ObjectId(farmId),
              workdayId: workdayObjectId,
              harvesterId: new Types.ObjectId(entry.harvesterId),
              measurementUnitId: new Types.ObjectId(entry.measurementUnitId),
              unitCount: Types.Decimal128.fromString(
                entry.unitCount.toString(),
              ),
              totalKg: Types.Decimal128.fromString(totalKg.toString()),
              measuredKg:
                entry.measuredKg == null
                  ? null
                  : Types.Decimal128.fromString(entry.measuredKg.toString()),
              recordedAt: new Date(entry.recordedAt),
              syncedOffline: true,
            },
          },
          upsert: true,
        },
      });
      creating.push(entry.clientEntryId);
      results.push({
        clientEntryId: entry.clientEntryId,
        status: 'created',
      });
    }

    if (operations.length > 0) {
      try {
        await this.harvestEntryModel.bulkWrite(operations, { ordered: false });
      } catch (error) {
        // Carrera entre dos reintentos concurrentes del mismo lote: el
        // índice único la resuelve y la fila queda igual escrita una sola
        // vez, así que un choque de llave duplicada no es una falla — con
        // `ordered: false` el resto del lote se aplicó igual. Cualquier otro
        // error sí se propaga.
        if (!this.isOnlyDuplicateKeyErrors(error)) {
          throw error;
        }
      }
    }

    // Los _id de lo recién insertado, en una sola consulta (bulkWrite no
    // devuelve los de un upsert de forma utilizable por clientEntryId).
    if (creating.length > 0) {
      const created = await this.harvestEntryModel
        .find({
          workdayId: workdayObjectId,
          clientEntryId: { $in: creating },
        })
        .select('_id clientEntryId')
        .exec();
      const idsByClientEntryId = new Map(
        created.map((doc) => [doc.clientEntryId, doc._id.toString()]),
      );

      for (const result of results) {
        if (result.status === 'created') {
          result._id = idsByClientEntryId.get(result.clientEntryId);
        }
      }
    }

    logSyncBatch(scope, context, results, startedAt);

    return results;
  }

  // Lista las entregas de una jornada específica.
  async findAll(farmId: string, workdayId: string): Promise<HarvestEntryDto[]> {
    const found = await this.harvestEntryModel
      .find({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

  // Kilos de una entrega, según cómo se captura su unidad de medida (ver
  // measurement-unit.schema.ts). Nunca se confía en un total que mande el
  // cliente: en COUNT sale del kgFactor del catálogo, y en WEIGHT el cliente
  // solo aporta la magnitud que marcó la romana — el signo lo pone
  // unitCount (-1 = descuento, RF-02.3). Devuelve null si a la entrada le
  // falta lo que su modo necesita, para que syncOne la rechace con su razón
  // en vez de guardar kilos inventados.
  private resolveTotalKg(
    entry: SyncHarvestEntryEntryDto,
    measurementUnit: MeasurementUnitDto,
  ): number | null {
    if (measurementUnit.mode === 'WEIGHT') {
      if (entry.weightKg === undefined) {
        return null;
      }

      return this.roundToOneDecimal(
        Math.sign(entry.unitCount) * entry.weightKg,
      );
    }

    if (
      measurementUnit.kgFactor === undefined ||
      measurementUnit.kgFactor === null
    ) {
      return null;
    }

    return this.roundToOneDecimal(entry.unitCount * measurementUnit.kgFactor);
  }

  // Un decimal es la resolución de todo el sistema (el peso tipeado y el
  // kgFactor ya llegan redondeados así, ver sus DTOs), pero multiplicar en
  // float igual devuelve cosas como 0.30000000000000004 — y eso se guardaría
  // tal cual en el Decimal128.
  private roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
  }

  // Arma un resultado de tipo "rechazado". El código es el contrato con
  // ui-app (que lo traduce a español); el texto queda para el log del
  // server, igual que en las AppException.
  private rejected(
    clientEntryId: string,
    reasonCode: ErrorCode,
    reason: string,
  ): SyncHarvestEntryResponseDto {
    return { clientEntryId, status: 'rejected', reasonCode, reason };
  }

  // Chequea si todo lo que falló en un bulkWrite fueron choques de llave
  // duplicada (código 11000) — o sea, filas que otro reintento concurrente
  // ya había escrito. Cualquier otra cosa mezclada ahí adentro no se puede
  // tragar en silencio.
  private isOnlyDuplicateKeyErrors(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const { code, writeErrors } = error as {
      code?: number;
      writeErrors?: { code?: number; err?: { code?: number } }[];
    };

    if (Array.isArray(writeErrors) && writeErrors.length > 0) {
      return writeErrors.every(
        (writeError) =>
          (writeError.code ?? writeError.err?.code) ===
          MONGO_DUPLICATE_KEY_ERROR_CODE,
      );
    }

    return code === MONGO_DUPLICATE_KEY_ERROR_CODE;
  }

  // Convierte el documento a DTO, incluyendo unitCount y totalKg de
  // Decimal128 a number.
  private toDto(doc: HarvestEntryDocument): HarvestEntryDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      workdayId: doc.workdayId.toString(),
      harvesterId: doc.harvesterId.toString(),
      measurementUnitId: doc.measurementUnitId.toString(),
      unitCount: Number(doc.unitCount.toString()),
      totalKg: Number(doc.totalKg.toString()),
      // ?? null y no el crudo: una entrega anterior a este campo se hidrata
      // con undefined, y el cliente distingue "nadie la pesó" por null.
      measuredKg: doc.measuredKg ? Number(doc.measuredKg.toString()) : null,
      clientEntryId: doc.clientEntryId,
      recordedAt: doc.recordedAt.toISOString(),
      syncedOffline: doc.syncedOffline,
    };
  }
}

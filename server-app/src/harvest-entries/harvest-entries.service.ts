import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HarvesterWorkdayService } from '../harvester-workday/harvester-workday.service';
import { HarvestersService } from '../harvesters/harvesters.service';
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

  // Sube un batch de entregas capturadas offline. Igual que en
  // harvester-workday: si la jornada no existe o ya está cerrada, rechaza
  // TODO el batch de una sola vez; si está abierta, procesa cada entrada y
  // devuelve un resultado por ítem (nunca un error HTTP).
  async sync(
    farmId: string,
    workdayId: string,
    entries: SyncHarvestEntryEntryDto[],
  ): Promise<SyncHarvestEntryResponseDto[]> {
    const workday = await this.workdaysService.findById(farmId, workdayId);

    if (!workday) {
      return entries.map((entry) =>
        this.rejected(entry.clientEntryId, 'Workday not found'),
      );
    }

    if (workday.status === 'CLOSED') {
      return entries.map((entry) =>
        this.rejected(entry.clientEntryId, 'Workday is already closed'),
      );
    }

    const results: SyncHarvestEntryResponseDto[] = [];
    for (const entry of entries) {
      results.push(await this.syncOne(farmId, workdayId, entry));
    }

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

  // Procesa una sola entrega del batch:
  // 1) si el clientEntryId ya existe, es un reintento — already-synced.
  // 2) valida que el cosechador exista y esté activo en la farm.
  // 3) valida que el cosechador ya esté en el roster de esta jornada (no se
  //    puede registrar una entrega de alguien que nunca fue agregado).
  // 4) valida que la unidad de medida exista y esté activa.
  // 5) calcula totalKg = unitCount × kgFactor del lado del servidor (nunca
  //    se confía en un totalKg que mande el cliente) y crea el registro.
  private async syncOne(
    farmId: string,
    workdayId: string,
    entry: SyncHarvestEntryEntryDto,
  ): Promise<SyncHarvestEntryResponseDto> {
    const existing = await this.harvestEntryModel
      .findOne({
        workdayId: new Types.ObjectId(workdayId),
        clientEntryId: entry.clientEntryId,
      })
      .exec();

    if (existing) {
      return {
        clientEntryId: entry.clientEntryId,
        status: 'already-synced',
        _id: existing._id.toString(),
      };
    }

    const harvester = await this.harvestersService.findActiveById(
      farmId,
      entry.harvesterId,
    );
    if (!harvester) {
      return this.rejected(
        entry.clientEntryId,
        'Harvester not found in the caller farm roster',
      );
    }

    const onRoster = await this.harvesterWorkdayService.existsInRoster(
      farmId,
      workdayId,
      entry.harvesterId,
    );
    if (!onRoster) {
      return this.rejected(
        entry.clientEntryId,
        'Harvester is not on this workday roster',
      );
    }

    const measurementUnit = await this.measurementUnitsService.findActiveById(
      farmId,
      entry.measurementUnitId,
    );
    if (!measurementUnit) {
      return this.rejected(
        entry.clientEntryId,
        'Measurement unit not found in the caller farm catalog',
      );
    }

    const totalKg = entry.unitCount * measurementUnit.kgFactor;

    try {
      const created = await this.harvestEntryModel.create({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
        harvesterId: new Types.ObjectId(entry.harvesterId),
        measurementUnitId: new Types.ObjectId(entry.measurementUnitId),
        unitCount: Types.Decimal128.fromString(entry.unitCount.toString()),
        totalKg: Types.Decimal128.fromString(totalKg.toString()),
        recordedAt: new Date(entry.recordedAt),
        clientEntryId: entry.clientEntryId,
        syncedOffline: true,
      });

      return {
        clientEntryId: entry.clientEntryId,
        status: 'created',
        _id: created._id.toString(),
      };
    } catch (error) {
      // Única colisión posible acá (a diferencia del roster, no hay otros
      // índices únicos sobre esta colección): dos reintentos concurrentes
      // con el mismo clientEntryId. Se resuelve re-consultando y
      // devolviendo already-synced.
      if (this.isDuplicateClientEntryIdError(error)) {
        const raced = await this.harvestEntryModel
          .findOne({
            workdayId: new Types.ObjectId(workdayId),
            clientEntryId: entry.clientEntryId,
          })
          .exec();
        return {
          clientEntryId: entry.clientEntryId,
          status: 'already-synced',
          _id: raced?._id.toString(),
        };
      }

      throw error;
    }
  }

  // Arma un resultado de tipo "rechazado" con su razón.
  private rejected(
    clientEntryId: string,
    reason: string,
  ): SyncHarvestEntryResponseDto {
    return { clientEntryId, status: 'rejected', reason };
  }

  // Chequea si el error de Mongo es específicamente un choque en el índice
  // único {workdayId, clientEntryId} (código 11000 + keyPattern.clientEntryId).
  private isDuplicateClientEntryIdError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE &&
      'keyPattern' in error &&
      Boolean(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern
          ?.clientEntryId,
      )
    );
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
      clientEntryId: doc.clientEntryId,
      recordedAt: doc.recordedAt.toISOString(),
      syncedOffline: doc.syncedOffline,
    };
  }
}

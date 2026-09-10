import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { logSyncBatch } from '../common/logging/sync-batch-log';
import { HarvestersService } from '../harvesters/harvesters.service';
import { WorkdaysService } from '../workdays/workdays.service';
import {
  HarvesterWorkday,
  HarvesterWorkdayDocument,
} from './schemas/harvester-workday.schema';
import {
  HarvesterWorkdayDto,
  SyncHarvesterWorkdayEntryDto,
  SyncHarvesterWorkdayResponseDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Maneja el roster (lista de cosechadores) de una jornada. A diferencia de
 * los módulos anteriores esto NO es un CRUD en vivo: ui-app captura estos
 * datos offline y los sube después en un batch, por eso el método principal
 * es sync() en vez de create().
 */
@Injectable()
export class HarvesterWorkdayService {
  constructor(
    @InjectModel(HarvesterWorkday.name)
    private readonly harvesterWorkdayModel: Model<HarvesterWorkday>,
    private readonly harvestersService: HarvestersService,
    private readonly workdaysService: WorkdaysService,
  ) {}

  // Sube un batch de entradas de roster capturadas offline. Primero valida
  // que la jornada exista y esté abierta — si no, rechaza TODO el batch de
  // una sola vez, sin gastar consultas por cada ítem. Si está abierta,
  // procesa cada entrada una por una y devuelve un resultado por ítem
  // (created/already-synced/rejected). Nunca lanza un error HTTP: un
  // rechazo es un resultado de negocio válido, no una falla de la petición.
  async sync(
    farmId: string,
    workdayId: string,
    entries: SyncHarvesterWorkdayEntryDto[],
  ): Promise<SyncHarvesterWorkdayResponseDto[]> {
    const startedAt = Date.now();
    const scope = 'harvester-workday';
    const context = `workday=${workdayId}`;
    const workday = await this.workdaysService.findById(farmId, workdayId);

    if (!workday) {
      const rejectedAll = entries.map((entry) =>
        this.rejected(entry.clientEntryId, 'Workday not found'),
      );
      logSyncBatch(scope, context, rejectedAll, startedAt);
      return rejectedAll;
    }

    if (workday.status === 'CLOSED') {
      const rejectedAll = entries.map((entry) =>
        this.rejected(entry.clientEntryId, 'Workday is already closed'),
      );
      logSyncBatch(scope, context, rejectedAll, startedAt);
      return rejectedAll;
    }

    const results: SyncHarvesterWorkdayResponseDto[] = [];
    for (const entry of entries) {
      results.push(await this.syncOne(farmId, workdayId, entry));
    }

    logSyncBatch(scope, context, results, startedAt);

    return results;
  }

  // Lista el roster de una jornada específica.
  async findAll(
    farmId: string,
    workdayId: string,
  ): Promise<HarvesterWorkdayDto[]> {
    const found = await this.harvesterWorkdayModel
      .find({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

  // Chequea si un cosechador ya está en el roster de una jornada. Lo usa
  // harvest-entries para no dejar registrar una entrega de alguien que
  // nunca fue agregado al roster primero.
  // Todo el roster de la jornada de una sola vez. Mismo motivo que
  // findActiveIdsIn en harvesters: el sync de entregas preguntaba
  // existsInRoster una vez por anotación, y con un lote grande eso solo
  // eran cientos de consultas en serie contra Atlas.
  async findRosterHarvesterIds(
    farmId: string,
    workdayId: string,
  ): Promise<Set<string>> {
    if (!Types.ObjectId.isValid(workdayId)) {
      return new Set();
    }

    const found = await this.harvesterWorkdayModel
      .find({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      })
      .select('harvesterId')
      .exec();

    return new Set(found.map((doc) => doc.harvesterId.toString()));
  }

  async existsInRoster(
    farmId: string,
    workdayId: string,
    harvesterId: string,
  ): Promise<boolean> {
    const found = await this.harvesterWorkdayModel
      .exists({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
        harvesterId: new Types.ObjectId(harvesterId),
      })
      .exec();

    return found !== null;
  }

  // Procesa una sola entrada del batch:
  // 1) si el clientEntryId ya existe, es un reintento — devuelve
  //    already-synced sin tocar nada más.
  // 2) si el cosechador no existe o no está activo en la farm, rechaza.
  // 3) si no hay conflicto, crea el registro. Si Mongo tira un choque de
  //    índice único, distingue cuál: mismo clientEntryId (carrera entre
  //    reintentos concurrentes — se resuelve re-consultando y devolviendo
  //    already-synced), mismo harvesterId (ya estaba en el roster con otro
  //    clientEntryId, rechaza), o mismo workdayNumber (otro cosechador ya
  //    tiene ese número en esta jornada, rechaza).
  private async syncOne(
    farmId: string,
    workdayId: string,
    entry: SyncHarvesterWorkdayEntryDto,
  ): Promise<SyncHarvesterWorkdayResponseDto> {
    const existing = await this.harvesterWorkdayModel
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

    try {
      const created = await this.harvesterWorkdayModel.create({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
        harvesterId: new Types.ObjectId(entry.harvesterId),
        workdayNumber: entry.workdayNumber,
        clientEntryId: entry.clientEntryId,
        addedAt: new Date(),
        syncedOffline: true,
      });

      return {
        clientEntryId: entry.clientEntryId,
        status: 'created',
        _id: created._id.toString(),
      };
    } catch (error) {
      if (this.isDuplicateKeyOn(error, 'clientEntryId')) {
        const raced = await this.harvesterWorkdayModel
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

      if (this.isDuplicateKeyOn(error, 'harvesterId')) {
        return this.rejected(
          entry.clientEntryId,
          'Harvester is already on this workday roster',
        );
      }

      if (this.isDuplicateKeyOn(error, 'workdayNumber')) {
        return this.rejected(
          entry.clientEntryId,
          'workdayNumber is already assigned to a different harvester in this workday',
        );
      }

      throw error;
    }
  }

  // Arma un resultado de tipo "rechazado" con su razón.
  private rejected(
    clientEntryId: string,
    reason: string,
  ): SyncHarvesterWorkdayResponseDto {
    return { clientEntryId, status: 'rejected', reason };
  }

  // Chequea si el error de Mongo es un choque de índice único sobre un
  // campo específico (código 11000 + keyPattern[field]).
  private isDuplicateKeyOn(error: unknown, field: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE &&
      'keyPattern' in error &&
      Boolean(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern?.[field],
      )
    );
  }

  // Convierte el documento a DTO.
  private toDto(doc: HarvesterWorkdayDocument): HarvesterWorkdayDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      workdayId: doc.workdayId.toString(),
      harvesterId: doc.harvesterId.toString(),
      workdayNumber: doc.workdayNumber,
      clientEntryId: doc.clientEntryId,
      addedAt: doc.addedAt.toISOString(),
      syncedOffline: doc.syncedOffline,
    };
  }
}

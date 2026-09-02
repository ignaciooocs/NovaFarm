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

// Mongo duplicate-key error code.
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

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

  async findAll(farmId: string, workdayId: string): Promise<HarvestEntryDto[]> {
    const found = await this.harvestEntryModel
      .find({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

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

  private rejected(
    clientEntryId: string,
    reason: string,
  ): SyncHarvestEntryResponseDto {
    return { clientEntryId, status: 'rejected', reason };
  }

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

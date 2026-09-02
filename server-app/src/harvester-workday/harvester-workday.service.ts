import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

// Mongo duplicate-key error code.
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class HarvesterWorkdayService {
  constructor(
    @InjectModel(HarvesterWorkday.name)
    private readonly harvesterWorkdayModel: Model<HarvesterWorkday>,
    private readonly harvestersService: HarvestersService,
    private readonly workdaysService: WorkdaysService,
  ) {}

  async sync(
    farmId: string,
    workdayId: string,
    entries: SyncHarvesterWorkdayEntryDto[],
  ): Promise<SyncHarvesterWorkdayResponseDto[]> {
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

    const results: SyncHarvesterWorkdayResponseDto[] = [];
    for (const entry of entries) {
      results.push(await this.syncOne(farmId, workdayId, entry));
    }

    return results;
  }

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

  private rejected(
    clientEntryId: string,
    reason: string,
  ): SyncHarvesterWorkdayResponseDto {
    return { clientEntryId, status: 'rejected', reason };
  }

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

import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HarvesterWorkdayService } from '../harvester-workday/harvester-workday.service';
import { HarvestersService } from '../harvesters/harvesters.service';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { WorkdaysService } from '../workdays/workdays.service';
import { HarvestEntry } from './schemas/harvest-entry.schema';
import { HarvestEntriesService } from './harvest-entries.service';

describe('HarvestEntriesService', () => {
  let harvestEntriesService: HarvestEntriesService;

  const harvestEntryModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const harvestersService = {
    findActiveById: jest.fn(),
  };

  const measurementUnitsService = {
    findActiveById: jest.fn(),
  };

  const workdaysService = {
    findById: jest.fn(),
  };

  const harvesterWorkdayService = {
    existsInRoster: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const workdayId = new Types.ObjectId().toString();
  const harvesterId = new Types.ObjectId().toString();
  const measurementUnitId = new Types.ObjectId().toString();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HarvestEntriesService,
        {
          provide: getModelToken(HarvestEntry.name),
          useValue: harvestEntryModel,
        },
        { provide: HarvestersService, useValue: harvestersService },
        {
          provide: MeasurementUnitsService,
          useValue: measurementUnitsService,
        },
        { provide: WorkdaysService, useValue: workdaysService },
        {
          provide: HarvesterWorkdayService,
          useValue: harvesterWorkdayService,
        },
      ],
    }).compile();

    harvestEntriesService = module.get(HarvestEntriesService);
  });

  describe('sync', () => {
    const entries = [
      {
        clientEntryId: 'local-1',
        harvesterId,
        measurementUnitId,
        unitCount: 3,
        recordedAt: '2026-09-02T09:15:00.000Z',
      },
    ];

    it('rejects every entry when the workday does not exist for the caller farm', async () => {
      workdaysService.findById.mockResolvedValue(null);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reason: 'Workday not found',
        },
      ]);
      expect(harvestEntryModel.findOne).not.toHaveBeenCalled();
    });

    it('rejects every entry when the workday is already closed', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'CLOSED' });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reason: 'Workday is already closed',
        },
      ]);
    });

    it('rejects when the harvester does not exist in the caller farm', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvestEntryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue(null);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reason: 'Harvester not found in the caller farm roster',
        },
      ]);
      expect(harvesterWorkdayService.existsInRoster).not.toHaveBeenCalled();
    });

    it('rejects when the harvester is not on the workday roster', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvestEntryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      harvesterWorkdayService.existsInRoster.mockResolvedValue(false);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reason: 'Harvester is not on this workday roster',
        },
      ]);
      expect(measurementUnitsService.findActiveById).not.toHaveBeenCalled();
    });

    it('rejects when the measurement unit does not exist in the caller farm', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvestEntryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      harvesterWorkdayService.existsInRoster.mockResolvedValue(true);
      measurementUnitsService.findActiveById.mockResolvedValue(null);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reason: 'Measurement unit not found in the caller farm catalog',
        },
      ]);
      expect(harvestEntryModel.create).not.toHaveBeenCalled();
    });

    it('creates an entry and computes totalKg from unitCount x kgFactor', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvestEntryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      harvesterWorkdayService.existsInRoster.mockResolvedValue(true);
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        kgFactor: 10,
        active: true,
      });
      const createdId = new Types.ObjectId();
      harvestEntryModel.create.mockResolvedValue({ _id: createdId });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(harvestEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unitCount: Types.Decimal128.fromString('3'),
          totalKg: Types.Decimal128.fromString('30'),
          clientEntryId: 'local-1',
          syncedOffline: true,
        }),
      );
      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'created',
          _id: createdId.toString(),
        },
      ]);
    });

    it('returns already-synced when retried with the same clientEntryId', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      const existingId = new Types.ObjectId();
      harvestEntryModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: existingId }),
      });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(harvestersService.findActiveById).not.toHaveBeenCalled();
      expect(harvestEntryModel.create).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'already-synced',
          _id: existingId.toString(),
        },
      ]);
    });
  });

  describe('findAll', () => {
    it('lists entries scoped to the caller farm and workday', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      harvestEntryModel.find.mockReturnValue({ exec });

      await harvestEntriesService.findAll(farmId, workdayId);

      expect(harvestEntryModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      });
    });
  });
});

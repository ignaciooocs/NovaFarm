import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HarvestersService } from '../harvesters/harvesters.service';
import { WorkdaysService } from '../workdays/workdays.service';
import { HarvesterWorkday } from './schemas/harvester-workday.schema';
import { HarvesterWorkdayService } from './harvester-workday.service';

describe('HarvesterWorkdayService', () => {
  let harvesterWorkdayService: HarvesterWorkdayService;

  const harvesterWorkdayModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
  };

  const harvestersService = {
    findActiveById: jest.fn(),
  };

  const workdaysService = {
    findById: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const workdayId = new Types.ObjectId().toString();
  const harvesterId = new Types.ObjectId().toString();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HarvesterWorkdayService,
        {
          provide: getModelToken(HarvesterWorkday.name),
          useValue: harvesterWorkdayModel,
        },
        { provide: HarvestersService, useValue: harvestersService },
        { provide: WorkdaysService, useValue: workdaysService },
      ],
    }).compile();

    harvesterWorkdayService = module.get(HarvesterWorkdayService);
  });

  describe('sync', () => {
    const entries = [
      { clientEntryId: 'local-1', harvesterId, workdayNumber: 1 },
    ];

    it('rejects every entry when the workday does not exist for the caller farm', async () => {
      workdaysService.findById.mockResolvedValue(null);

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reasonCode: 'WORKDAY_NOT_FOUND',
          reason: 'Workday not found',
        },
      ]);
      expect(harvesterWorkdayModel.findOne).not.toHaveBeenCalled();
    });

    it('rejects every entry when the workday is already closed', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'CLOSED' });

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reasonCode: 'WORKDAY_CLOSED',
          reason: 'Workday is already closed',
        },
      ]);
    });

    it('creates a new roster entry when the workday is open', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvesterWorkdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      const createdId = new Types.ObjectId();
      harvesterWorkdayModel.create.mockResolvedValue({ _id: createdId });

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(harvesterWorkdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientEntryId: 'local-1',
          workdayNumber: 1,
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
      harvesterWorkdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: existingId }),
      });

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(harvestersService.findActiveById).not.toHaveBeenCalled();
      expect(harvesterWorkdayModel.create).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'already-synced',
          _id: existingId.toString(),
        },
      ]);
    });

    it('rejects when the harvester does not exist in the caller farm', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvesterWorkdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue(null);

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reasonCode: 'HARVESTER_NOT_FOUND',
          reason: 'Harvester not found in the caller farm roster',
        },
      ]);
      expect(harvesterWorkdayModel.create).not.toHaveBeenCalled();
    });

    it('rejects when the harvester is already on the roster under a different clientEntryId', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvesterWorkdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      harvesterWorkdayModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { workdayId: 1, harvesterId: 1 },
      });

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reasonCode: 'HARVESTER_ALREADY_IN_ROSTER',
          reason: 'Harvester is already on this workday roster',
        },
      ]);
    });

    it('rejects when the workdayNumber is already taken in this workday', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
      harvesterWorkdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      harvestersService.findActiveById.mockResolvedValue({
        _id: harvesterId,
        active: true,
      });
      harvesterWorkdayModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { workdayId: 1, workdayNumber: 1 },
      });

      const result = await harvesterWorkdayService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result[0].status).toEqual('rejected');
      expect(result[0].reasonCode).toEqual('WORKDAY_NUMBER_TAKEN');
    });
  });

  describe('findAll', () => {
    it('lists roster entries scoped to the caller farm and workday', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      harvesterWorkdayModel.find.mockReturnValue({ exec });

      await harvesterWorkdayService.findAll(farmId, workdayId);

      expect(harvesterWorkdayModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      });
    });
  });

  describe('existsInRoster', () => {
    it('returns true when the harvester is on the roster', async () => {
      harvesterWorkdayModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      });

      const result = await harvesterWorkdayService.existsInRoster(
        farmId,
        workdayId,
        harvesterId,
      );

      expect(result).toBe(true);
    });

    it('returns false when the harvester is not on the roster', async () => {
      harvesterWorkdayModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await harvesterWorkdayService.existsInRoster(
        farmId,
        workdayId,
        harvesterId,
      );

      expect(result).toBe(false);
    });
  });
});

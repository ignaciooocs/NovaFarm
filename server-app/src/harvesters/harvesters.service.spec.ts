import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Harvester } from './schemas/harvester.schema';
import { HarvestersService } from './harvesters.service';

describe('HarvestersService', () => {
  let harvestersService: HarvestersService;

  const harvesterModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HarvestersService,
        { provide: getModelToken(Harvester.name), useValue: harvesterModel },
      ],
    }).compile();

    harvestersService = module.get(HarvestersService);
  });

  describe('create', () => {
    it('creates a harvester scoped to the caller farm, without nationalId', async () => {
      const createdId = new Types.ObjectId();
      harvesterModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        firstName: 'Juan',
        lastName: 'Perez',
        nickname: undefined,
        active: true,
      });

      const result = await harvestersService.create(farmId, {
        firstName: 'Juan',
        lastName: 'Perez',
      });

      expect(harvesterModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        firstName: 'Juan',
        lastName: 'Perez',
        nickname: undefined,
        active: true,
      });
      // The document passed to Mongo must never include nationalId — the
      // create DTO doesn't accept it (quick field registration), and the
      // exact toHaveBeenCalledWith above already proves no extra key snuck in.
      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        firstName: 'Juan',
        lastName: 'Perez',
        nickname: undefined,
        active: true,
      });
    });

    it('allows creating two harvesters with the same name in the same farm', async () => {
      const firstId = new Types.ObjectId();
      const secondId = new Types.ObjectId();
      harvesterModel.create
        .mockResolvedValueOnce({
          _id: firstId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: true,
        })
        .mockResolvedValueOnce({
          _id: secondId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: true,
        });

      const first = await harvestersService.create(farmId, {
        firstName: 'Juan',
        lastName: 'Perez',
      });
      const second = await harvestersService.create(farmId, {
        firstName: 'Juan',
        lastName: 'Perez',
      });

      expect(first._id).not.toEqual(second._id);
      expect(harvesterModel.create).toHaveBeenCalledTimes(2);
    });

    it('does not expose nationalId in the response even if the Mongo document has it set', async () => {
      const createdId = new Types.ObjectId();
      harvesterModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        firstName: 'Juan',
        lastName: 'Perez',
        nationalId: '12345678-9',
        active: true,
      });

      const result = await harvestersService.create(farmId, {
        firstName: 'Juan',
        lastName: 'Perez',
      });

      expect(result).not.toHaveProperty('nationalId');
    });
  });

  describe('findAll', () => {
    it('lists harvesters scoped to the caller farm without a filter', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      harvesterModel.find.mockReturnValue({ exec });

      const result = await harvestersService.findAll(farmId, {});

      expect(harvesterModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
      });
      expect(result).toEqual([
        {
          _id: docs[0]._id.toString(),
          farmId,
          firstName: 'Juan',
          lastName: 'Perez',
          nickname: undefined,
          active: true,
        },
      ]);
    });

    it('lists harvesters scoped to the caller farm filtered by active', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      harvesterModel.find.mockReturnValue({ exec });

      await harvestersService.findAll(farmId, { active: true });

      expect(harvesterModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
    });

    it('does not expose nationalId in listed results even if the Mongo document has it set', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          nationalId: '12345678-9',
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      harvesterModel.find.mockReturnValue({ exec });

      const result = await harvestersService.findAll(farmId, {});

      expect(result[0]).not.toHaveProperty('nationalId');
    });
  });

  describe('findActiveById', () => {
    it('returns the harvester when it is active and belongs to the farm', async () => {
      const harvesterId = new Types.ObjectId();
      const doc = {
        _id: harvesterId,
        farmId: new Types.ObjectId(farmId),
        firstName: 'Juan',
        lastName: 'Perez',
        active: true,
      };
      const exec = jest.fn().mockResolvedValue(doc);
      harvesterModel.findOne.mockReturnValue({ exec });

      const result = await harvestersService.findActiveById(
        farmId,
        harvesterId.toString(),
      );

      expect(harvesterModel.findOne).toHaveBeenCalledWith({
        _id: harvesterId.toString(),
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
      expect(result).toEqual({
        _id: harvesterId.toString(),
        farmId,
        firstName: 'Juan',
        lastName: 'Perez',
        nickname: undefined,
        active: true,
      });
    });

    it('returns null when no matching active harvester exists for the farm', async () => {
      const exec = jest.fn().mockResolvedValue(null);
      harvesterModel.findOne.mockReturnValue({ exec });

      const result = await harvestersService.findActiveById(
        farmId,
        new Types.ObjectId().toString(),
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await harvestersService.findActiveById(
        farmId,
        'not-an-id',
      );

      expect(harvesterModel.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const harvesterId = new Types.ObjectId();

    it('edits a harvester scoped to the caller farm', async () => {
      const exec = jest.fn().mockResolvedValue({
        _id: harvesterId,
        farmId: new Types.ObjectId(farmId),
        firstName: 'Juan',
        lastName: 'Gonzalez',
        nickname: 'Juanito',
        active: true,
      });
      harvesterModel.findOneAndUpdate.mockReturnValue({ exec });

      const result = await harvestersService.update(
        farmId,
        harvesterId.toString(),
        { lastName: 'Gonzalez', nickname: 'Juanito' },
      );

      expect(harvesterModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: harvesterId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { lastName: 'Gonzalez', nickname: 'Juanito' }, $unset: {} },
        { new: true },
      );
      expect(result?.lastName).toEqual('Gonzalez');
    });

    it('clears an existing nickname when nickname is explicitly null ($unset, not $set)', async () => {
      harvesterModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: harvesterId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: true,
        }),
      });

      await harvestersService.update(farmId, harvesterId.toString(), {
        nickname: null,
      });

      expect(harvesterModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: harvesterId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: {}, $unset: { nickname: 1 } },
        { new: true },
      );
    });

    it('leaves the nickname untouched when it is omitted from the update', async () => {
      harvesterModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: harvesterId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Gonzalez',
          nickname: 'Juanito',
          active: true,
        }),
      });

      await harvestersService.update(farmId, harvesterId.toString(), {
        lastName: 'Gonzalez',
      });

      expect(harvesterModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: harvesterId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { lastName: 'Gonzalez' }, $unset: {} },
        { new: true },
      );
    });

    it('deactivates a harvester without touching other fields', async () => {
      harvesterModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: harvesterId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: false,
        }),
      });

      await harvestersService.update(farmId, harvesterId.toString(), {
        active: false,
      });

      expect(harvesterModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: harvesterId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { active: false }, $unset: {} },
        { new: true },
      );
    });

    it('reactivates a harvester that was deactivated (no active filter on the query)', async () => {
      harvesterModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: harvesterId,
          farmId: new Types.ObjectId(farmId),
          firstName: 'Juan',
          lastName: 'Perez',
          active: true,
        }),
      });

      const result = await harvestersService.update(
        farmId,
        harvesterId.toString(),
        { active: true },
      );

      expect(result?.active).toBe(true);
    });

    it('returns null when no matching harvester exists for the farm', async () => {
      harvesterModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await harvestersService.update(
        farmId,
        harvesterId.toString(),
        { firstName: 'Juan' },
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await harvestersService.update(farmId, 'not-an-id', {
        firstName: 'Juan',
      });

      expect(harvesterModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});

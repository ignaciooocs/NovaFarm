import { ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Fruit } from './schemas/fruit.schema';
import { FruitsService } from './fruits.service';

describe('FruitsService', () => {
  let fruitsService: FruitsService;

  const fruitModel = {
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
        FruitsService,
        { provide: getModelToken(Fruit.name), useValue: fruitModel },
      ],
    }).compile();

    fruitsService = module.get(FruitsService);
  });

  describe('create', () => {
    it('creates a fruit scoped to the caller farm', async () => {
      const createdId = new Types.ObjectId();
      fruitModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        name: 'Lemon',
        active: true,
      });

      const result = await fruitsService.create(farmId, { name: 'Lemon' });

      expect(fruitModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        name: 'Lemon',
        active: true,
      });
      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        name: 'Lemon',
        active: true,
      });
    });

    it('throws ConflictException when the name is already taken for the farm', async () => {
      fruitModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { farmId: 1, name: 1 },
      });

      await expect(
        fruitsService.create(farmId, { name: 'Lemon' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('lists fruits scoped to the caller farm without a filter', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Lemon',
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      fruitModel.find.mockReturnValue({ exec });

      const result = await fruitsService.findAll(farmId, {});

      expect(fruitModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
      });
      expect(result).toEqual([
        {
          _id: docs[0]._id.toString(),
          farmId,
          name: 'Lemon',
          active: true,
        },
      ]);
    });

    it('lists fruits scoped to the caller farm filtered by active', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      fruitModel.find.mockReturnValue({ exec });

      await fruitsService.findAll(farmId, { active: true });

      expect(fruitModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
    });
  });

  describe('findActiveById', () => {
    it('returns the fruit when it is active and belongs to the farm', async () => {
      const fruitId = new Types.ObjectId();
      const doc = {
        _id: fruitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Lemon',
        active: true,
      };
      const exec = jest.fn().mockResolvedValue(doc);
      fruitModel.findOne.mockReturnValue({ exec });

      const result = await fruitsService.findActiveById(
        farmId,
        fruitId.toString(),
      );

      expect(fruitModel.findOne).toHaveBeenCalledWith({
        _id: fruitId.toString(),
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
      expect(result).toEqual({
        _id: fruitId.toString(),
        farmId,
        name: 'Lemon',
        active: true,
      });
    });

    it('returns null when no matching active fruit exists for the farm', async () => {
      const exec = jest.fn().mockResolvedValue(null);
      fruitModel.findOne.mockReturnValue({ exec });

      const result = await fruitsService.findActiveById(
        farmId,
        new Types.ObjectId().toString(),
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await fruitsService.findActiveById(farmId, 'not-an-id');

      expect(fruitModel.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const fruitId = new Types.ObjectId();

    it('renames a fruit scoped to the caller farm', async () => {
      const exec = jest.fn().mockResolvedValue({
        _id: fruitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Lime',
        active: true,
      });
      fruitModel.findOneAndUpdate.mockReturnValue({ exec });

      const result = await fruitsService.update(farmId, fruitId.toString(), {
        name: 'Lime',
      });

      expect(fruitModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: fruitId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { name: 'Lime' } },
        { new: true },
      );
      expect(result?.name).toEqual('Lime');
    });

    it('deactivates a fruit without touching its name', async () => {
      const exec = jest.fn().mockResolvedValue({
        _id: fruitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Lemon',
        active: false,
      });
      fruitModel.findOneAndUpdate.mockReturnValue({ exec });

      await fruitsService.update(farmId, fruitId.toString(), {
        active: false,
      });

      expect(fruitModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: fruitId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { active: false } },
        { new: true },
      );
    });

    it('reactivates a fruit that was deactivated (no active filter on the query)', async () => {
      const exec = jest.fn().mockResolvedValue({
        _id: fruitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Lemon',
        active: true,
      });
      fruitModel.findOneAndUpdate.mockReturnValue({ exec });

      const result = await fruitsService.update(farmId, fruitId.toString(), {
        active: true,
      });

      expect(result?.active).toBe(true);
    });

    it('throws ConflictException when renaming to a name already taken in the farm', async () => {
      fruitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockRejectedValue({
          code: 11000,
          keyPattern: { farmId: 1, name: 1 },
        }),
      });

      await expect(
        fruitsService.update(farmId, fruitId.toString(), { name: 'Lime' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns null when no matching fruit exists for the farm', async () => {
      fruitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await fruitsService.update(farmId, fruitId.toString(), {
        name: 'Lime',
      });

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await fruitsService.update(farmId, 'not-an-id', {
        name: 'Lime',
      });

      expect(fruitModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});

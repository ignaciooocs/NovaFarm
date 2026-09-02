import { ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { MeasurementUnit } from './schemas/measurement-unit.schema';
import { MeasurementUnitsService } from './measurement-units.service';

describe('MeasurementUnitsService', () => {
  let measurementUnitsService: MeasurementUnitsService;

  const measurementUnitModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementUnitsService,
        {
          provide: getModelToken(MeasurementUnit.name),
          useValue: measurementUnitModel,
        },
      ],
    }).compile();

    measurementUnitsService = module.get(MeasurementUnitsService);
  });

  describe('create', () => {
    it('creates a measurement unit scoped to the caller farm', async () => {
      const createdId = new Types.ObjectId();
      measurementUnitModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        name: 'Crate 10kg',
        kgFactor: Types.Decimal128.fromString('10'),
        active: true,
      });

      const result = await measurementUnitsService.create(farmId, {
        name: 'Crate 10kg',
        kgFactor: 10,
      });

      expect(measurementUnitModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        name: 'Crate 10kg',
        kgFactor: Types.Decimal128.fromString('10'),
        active: true,
      });
      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        name: 'Crate 10kg',
        kgFactor: 10,
        active: true,
      });
    });

    it('throws ConflictException when the name is already taken for the farm', async () => {
      measurementUnitModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { farmId: 1, name: 1 },
      });

      await expect(
        measurementUnitsService.create(farmId, {
          name: 'Crate 10kg',
          kgFactor: 10,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('lists measurement units scoped to the caller farm without a filter', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Crate 10kg',
          kgFactor: Types.Decimal128.fromString('10'),
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      measurementUnitModel.find.mockReturnValue({ exec });

      const result = await measurementUnitsService.findAll(farmId, {});

      expect(measurementUnitModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
      });
      expect(result).toEqual([
        {
          _id: docs[0]._id.toString(),
          farmId,
          name: 'Crate 10kg',
          kgFactor: 10,
          active: true,
        },
      ]);
    });

    it('lists measurement units scoped to the caller farm filtered by active', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      measurementUnitModel.find.mockReturnValue({ exec });

      await measurementUnitsService.findAll(farmId, { active: true });

      expect(measurementUnitModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
    });
  });

  describe('findActiveById', () => {
    it('returns the measurement unit when it is active and belongs to the farm', async () => {
      const unitId = new Types.ObjectId();
      const doc = {
        _id: unitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Crate 10kg',
        kgFactor: Types.Decimal128.fromString('10'),
        active: true,
      };
      const exec = jest.fn().mockResolvedValue(doc);
      measurementUnitModel.findOne.mockReturnValue({ exec });

      const result = await measurementUnitsService.findActiveById(
        farmId,
        unitId.toString(),
      );

      expect(measurementUnitModel.findOne).toHaveBeenCalledWith({
        _id: unitId.toString(),
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
      expect(result).toEqual({
        _id: unitId.toString(),
        farmId,
        name: 'Crate 10kg',
        kgFactor: 10,
        active: true,
      });
    });

    it('returns null when no matching active unit exists for the farm', async () => {
      const exec = jest.fn().mockResolvedValue(null);
      measurementUnitModel.findOne.mockReturnValue({ exec });

      const result = await measurementUnitsService.findActiveById(
        farmId,
        new Types.ObjectId().toString(),
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await measurementUnitsService.findActiveById(
        farmId,
        'not-an-id',
      );

      expect(measurementUnitModel.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});

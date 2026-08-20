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
    it('creates a measurement unit scoped to the caller farm, storing kgFactor as Decimal128 and returning it as a string', async () => {
      const createdId = new Types.ObjectId();
      let capturedCreateArg: {
        farmId: Types.ObjectId;
        name: string;
        kgFactor: Types.Decimal128;
        active: boolean;
      } | null = null;

      measurementUnitModel.create.mockImplementation(
        (arg: {
          farmId: Types.ObjectId;
          name: string;
          kgFactor: Types.Decimal128;
          active: boolean;
        }) => {
          capturedCreateArg = arg;
          return Promise.resolve({ _id: createdId, ...arg });
        },
      );

      const result = await measurementUnitsService.create(farmId, {
        name: 'Caja 10kg',
        kgFactor: 10.5,
      });

      expect(measurementUnitModel.create).toHaveBeenCalledTimes(1);
      expect(capturedCreateArg).not.toBeNull();

      const createCallArg = capturedCreateArg!;
      expect(createCallArg.farmId).toEqual(new Types.ObjectId(farmId));
      expect(createCallArg.name).toBe('Caja 10kg');
      expect(createCallArg.active).toBe(true);
      expect(createCallArg.kgFactor).toBeInstanceOf(Types.Decimal128);
      expect(createCallArg.kgFactor.toString()).toBe('10.5');

      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        name: 'Caja 10kg',
        kgFactor: '10.5',
        active: true,
      });
      expect(typeof result.kgFactor).toBe('string');
    });

    it('throws ConflictException when the name is already taken for the farm', async () => {
      measurementUnitModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { farmId: 1, name: 1 },
      });

      await expect(
        measurementUnitsService.create(farmId, {
          name: 'Caja 10kg',
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
          name: 'Caja 10kg',
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
          name: 'Caja 10kg',
          kgFactor: '10',
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
});

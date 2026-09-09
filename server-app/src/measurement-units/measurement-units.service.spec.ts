import { BadRequestException, ConflictException } from '@nestjs/common';
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
    findOneAndUpdate: jest.fn(),
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
        mode: 'COUNT',
        kgFactor: Types.Decimal128.fromString('10'),
        active: true,
      });

      const result = await measurementUnitsService.create(farmId, {
        name: 'Crate 10kg',
        mode: 'COUNT',
        kgFactor: 10,
      });

      expect(measurementUnitModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        name: 'Crate 10kg',
        mode: 'COUNT',
        kgFactor: Types.Decimal128.fromString('10'),
        active: true,
      });
      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        name: 'Crate 10kg',
        mode: 'COUNT',
        kgFactor: 10,
        active: true,
      });
    });

    it('stores no kgFactor for a WEIGHT unit — its kilos come off the scale on every entry', async () => {
      const createdId = new Types.ObjectId();
      measurementUnitModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        name: 'Capacho',
        mode: 'WEIGHT',
        kgFactor: null,
        active: true,
      });

      const result = await measurementUnitsService.create(farmId, {
        name: 'Capacho',
        mode: 'WEIGHT',
        // Aunque el cliente mande un factor, en WEIGHT no significa nada.
        kgFactor: 1,
      });

      expect(measurementUnitModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        name: 'Capacho',
        mode: 'WEIGHT',
        kgFactor: null,
        active: true,
      });
      expect(result.kgFactor).toBeNull();
      expect(result.mode).toBe('WEIGHT');
    });

    it('throws BadRequestException for a COUNT unit with no kgFactor', async () => {
      await expect(
        measurementUnitsService.create(farmId, {
          name: 'Crate',
          mode: 'COUNT',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(measurementUnitModel.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the name is already taken for the farm', async () => {
      measurementUnitModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { farmId: 1, name: 1 },
      });

      await expect(
        measurementUnitsService.create(farmId, {
          name: 'Crate 10kg',
          mode: 'COUNT',
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
          mode: 'COUNT',
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
          mode: 'COUNT',
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
        mode: 'COUNT',
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
        mode: 'COUNT',
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

  describe('update', () => {
    const unitId = new Types.ObjectId();

    it('edits name and kgFactor scoped to the caller farm, converting kgFactor to Decimal128', async () => {
      // Tocar kgFactor hace que update() lea primero la unidad (findAnyById)
      // para saber en qué modo está antes de decidir qué guardar.
      measurementUnitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Crate 10kg',
          mode: 'COUNT',
          kgFactor: Types.Decimal128.fromString('10'),
          active: true,
        }),
      });
      const exec = jest.fn().mockResolvedValue({
        _id: unitId,
        farmId: new Types.ObjectId(farmId),
        name: 'Crate 12kg',
        mode: 'COUNT',
        kgFactor: Types.Decimal128.fromString('12'),
        active: true,
      });
      measurementUnitModel.findOneAndUpdate.mockReturnValue({ exec });

      const result = await measurementUnitsService.update(
        farmId,
        unitId.toString(),
        { name: 'Crate 12kg', kgFactor: 12 },
      );

      expect(measurementUnitModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: unitId.toString(), farmId: new Types.ObjectId(farmId) },
        {
          $set: {
            name: 'Crate 12kg',
            mode: 'COUNT',
            kgFactor: Types.Decimal128.fromString('12'),
          },
        },
        { new: true },
      );
      expect(result?.kgFactor).toEqual(12);
    });

    it('deactivates a measurement unit without touching other fields', async () => {
      measurementUnitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Crate 10kg',
          mode: 'COUNT',
          kgFactor: Types.Decimal128.fromString('10'),
          active: false,
        }),
      });

      await measurementUnitsService.update(farmId, unitId.toString(), {
        active: false,
      });

      expect(measurementUnitModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: unitId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { active: false } },
        { new: true },
      );
    });

    it('reactivates a measurement unit that was deactivated (no active filter on the query)', async () => {
      measurementUnitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Crate 10kg',
          mode: 'COUNT',
          kgFactor: Types.Decimal128.fromString('10'),
          active: true,
        }),
      });

      const result = await measurementUnitsService.update(
        farmId,
        unitId.toString(),
        { active: true },
      );

      expect(result?.active).toBe(true);
    });

    it('throws ConflictException when renaming to a name already taken in the farm', async () => {
      measurementUnitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockRejectedValue({
          code: 11000,
          keyPattern: { farmId: 1, name: 1 },
        }),
      });

      await expect(
        measurementUnitsService.update(farmId, unitId.toString(), {
          name: 'Crate 10kg',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns null when no matching measurement unit exists for the farm', async () => {
      measurementUnitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await measurementUnitsService.update(
        farmId,
        unitId.toString(),
        { name: 'Crate 10kg' },
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await measurementUnitsService.update(farmId, 'not-an-id', {
        name: 'Crate 10kg',
      });

      expect(measurementUnitModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('clears kgFactor when switching a unit to WEIGHT', async () => {
      measurementUnitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Capacho',
          mode: 'COUNT',
          kgFactor: Types.Decimal128.fromString('10'),
          active: true,
        }),
      });
      measurementUnitModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Capacho',
          mode: 'WEIGHT',
          kgFactor: null,
          active: true,
        }),
      });

      const result = await measurementUnitsService.update(
        farmId,
        unitId.toString(),
        { mode: 'WEIGHT' },
      );

      expect(measurementUnitModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: unitId.toString(), farmId: new Types.ObjectId(farmId) },
        { $set: { mode: 'WEIGHT', kgFactor: null } },
        { new: true },
      );
      expect(result?.kgFactor).toBeNull();
    });

    it('throws BadRequestException when switching to COUNT with no kgFactor anywhere', async () => {
      measurementUnitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: unitId,
          farmId: new Types.ObjectId(farmId),
          name: 'Capacho',
          mode: 'WEIGHT',
          kgFactor: null,
          active: true,
        }),
      });

      await expect(
        measurementUnitsService.update(farmId, unitId.toString(), {
          mode: 'COUNT',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(measurementUnitModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // Unidades guardadas antes de que `mode` existiera: no traen el campo, y
  // toDto() lo deduce del sentinel que usaba la app en ese entonces. Sin
  // esto, un "capacho 1kg" ya creado se leería como COUNT y el Anotador le
  // mostraría los botones +1/+2/+5 en vez de pedir el peso.
  describe('units stored before `mode` existed', () => {
    function mockLegacyUnit(kgFactor: string) {
      measurementUnitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Legacy',
          kgFactor: Types.Decimal128.fromString(kgFactor),
          active: true,
        }),
      });
    }

    it('reads a kgFactor of 1 as WEIGHT, with no factor left over', async () => {
      mockLegacyUnit('1');

      const result = await measurementUnitsService.findActiveById(
        farmId,
        new Types.ObjectId().toString(),
      );

      expect(result?.mode).toBe('WEIGHT');
      expect(result?.kgFactor).toBeNull();
    });

    it('reads any other kgFactor as COUNT, keeping the factor', async () => {
      mockLegacyUnit('10');

      const result = await measurementUnitsService.findActiveById(
        farmId,
        new Types.ObjectId().toString(),
      );

      expect(result?.mode).toBe('COUNT');
      expect(result?.kgFactor).toBe(10);
    });
  });
});

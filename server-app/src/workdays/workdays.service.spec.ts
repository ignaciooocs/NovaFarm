import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { FruitsService } from '../fruits/fruits.service';
import { HarvestEntry } from '../harvest-entries/schemas/harvest-entry.schema';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { UsersService } from '../users/users.service';
import { Workday } from './schemas/workday.schema';
import { WorkdaysService } from './workdays.service';

describe('WorkdaysService', () => {
  let workdaysService: WorkdaysService;

  const workdayModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const harvestEntryModel = {
    aggregate: jest.fn(),
  };

  const fruitsService = {
    findActiveById: jest.fn(),
  };

  const measurementUnitsService = {
    findActiveById: jest.fn(),
  };

  const usersService = {
    findByFirebaseUid: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const fruitId = '507f1f77bcf86cd799439012';
  const measurementUnitId = '507f1f77bcf86cd799439013';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkdaysService,
        { provide: getModelToken(Workday.name), useValue: workdayModel },
        {
          provide: getModelToken(HarvestEntry.name),
          useValue: harvestEntryModel,
        },
        { provide: FruitsService, useValue: fruitsService },
        {
          provide: MeasurementUnitsService,
          useValue: measurementUnitsService,
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    workdaysService = module.get(WorkdaysService);
  });

  describe('create', () => {
    const dto = {
      clientEntryId: 'local-8f3a2b1c',
      date: '2026-09-02',
      fruitId,
      defaultMeasurementUnitId: measurementUnitId,
    };

    function mockNoExistingClientEntry() {
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
    }

    it('opens a workday and resolves recorderId from the authenticated recorder', async () => {
      mockNoExistingClientEntry();
      fruitsService.findActiveById.mockResolvedValue({
        _id: fruitId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
      });
      const recorderMongoId = new Types.ObjectId();
      usersService.findByFirebaseUid.mockResolvedValue({
        _id: recorderMongoId,
      });

      workdayModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: recorderMongoId,
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, role: 'recorder' },
        dto,
      );

      expect(usersService.findByFirebaseUid).toHaveBeenCalledWith(
        'firebase-uid',
      );
      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recorderId: recorderMongoId,
          status: 'OPEN',
          clientEntryId: dto.clientEntryId,
        }),
      );
      expect(result.recorderId).toEqual(recorderMongoId.toString());
      expect(result.status).toEqual('OPEN');
    });

    it('leaves recorderId null when opened by an admin (guest mode)', async () => {
      mockNoExistingClientEntry();
      fruitsService.findActiveById.mockResolvedValue({
        _id: fruitId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
      });

      workdayModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date(),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, role: 'admin' },
        dto,
      );

      expect(usersService.findByFirebaseUid).not.toHaveBeenCalled();
      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recorderId: null }),
      );
      expect(result.recorderId).toBeNull();
    });

    it('throws NotFoundException when the fruit does not exist in the caller farm', async () => {
      mockNoExistingClientEntry();
      fruitsService.findActiveById.mockResolvedValue(null);

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'u', farmId, role: 'admin' },
          dto,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(measurementUnitsService.findActiveById).not.toHaveBeenCalled();
      expect(workdayModel.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the measurement unit does not exist in the caller farm', async () => {
      mockNoExistingClientEntry();
      fruitsService.findActiveById.mockResolvedValue({
        _id: fruitId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue(null);

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'u', farmId, role: 'admin' },
          dto,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(workdayModel.create).not.toHaveBeenCalled();
    });

    it('returns the existing workday without re-validating when clientEntryId was already synced (idempotent retry)', async () => {
      const existing = {
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'u', farmId, role: 'admin' },
        dto,
      );

      expect(workdayModel.findOne).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        clientEntryId: dto.clientEntryId,
      });
      expect(fruitsService.findActiveById).not.toHaveBeenCalled();
      expect(workdayModel.create).not.toHaveBeenCalled();
      expect(result._id).toEqual(existing._id.toString());
    });

    it('returns the workday from a concurrent duplicate clientEntryId race instead of throwing', async () => {
      const raced = {
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      };
      // Primera consulta (antes de crear): nada todavía. Segunda consulta
      // (tras el choque de índice único): el registro que ganó la carrera.
      workdayModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(raced) });
      fruitsService.findActiveById.mockResolvedValue({
        _id: fruitId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
      });
      workdayModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { farmId: 1, clientEntryId: 1 },
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'u', farmId, role: 'admin' },
        dto,
      );

      expect(workdayModel.findOne).toHaveBeenCalledTimes(2);
      expect(result._id).toEqual(raced._id.toString());
    });

    it('propagates an unrelated error from create without swallowing it', async () => {
      mockNoExistingClientEntry();
      fruitsService.findActiveById.mockResolvedValue({
        _id: fruitId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
      });
      workdayModel.create.mockRejectedValue(new Error('boom'));

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'u', farmId, role: 'admin' },
          dto,
        ),
      ).rejects.toThrow('boom');
    });
  });

  describe('findAll', () => {
    it('lists workdays scoped to the caller farm without a filter', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      workdayModel.find.mockReturnValue({ exec });

      await workdaysService.findAll(farmId, {});

      expect(workdayModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
      });
    });

    it('lists workdays scoped to the caller farm filtered by status', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      workdayModel.find.mockReturnValue({ exec });

      await workdaysService.findAll(farmId, { status: 'OPEN' });

      expect(workdayModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        status: 'OPEN',
      });
    });
  });

  describe('close', () => {
    const workdayId = new Types.ObjectId().toString();

    it('closes an open workday and freezes the aggregated total', async () => {
      const workdayDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(workdayDoc),
      });
      harvestEntryModel.aggregate.mockResolvedValue([
        { total: Types.Decimal128.fromString('128.5') },
      ]);
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...workdayDoc,
          status: 'CLOSED',
          finalTotalKg: Types.Decimal128.fromString('128.5'),
        }),
      });

      const result = await workdaysService.close(farmId, workdayId);

      // findOneAndUpdate con $set puntual, no fetch+mutate+save() — .save()
      // revalida el documento COMPLETO, y una jornada abierta antes de que
      // clientEntryId se volviera required no lo tiene guardado (bug real,
      // ver el comentario en el service). $set solo debe tocar
      // finalTotalKg/status.
      expect(workdayModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: workdayId, farmId: new Types.ObjectId(farmId) },
        {
          $set: {
            finalTotalKg: Types.Decimal128.fromString('128.5'),
            status: 'CLOSED',
          },
        },
        { new: true },
      );
      expect(result.status).toEqual('CLOSED');
      expect(result.finalTotalKg).toEqual(128.5);
    });

    it('freezes a zero total when the workday has no harvest entries', async () => {
      const workdayDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(workdayDoc),
      });
      harvestEntryModel.aggregate.mockResolvedValue([]);
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...workdayDoc,
          status: 'CLOSED',
          finalTotalKg: Types.Decimal128.fromString('0'),
        }),
      });

      const result = await workdaysService.close(farmId, workdayId);

      expect(result.finalTotalKg).toEqual(0);
    });

    it('closes a workday that predates clientEntryId becoming required, without validating the whole document', async () => {
      // Antes del fix, esto reventaba con
      // "ValidationError: Workday validation failed: clientEntryId: Path
      // `clientEntryId` is required." al llamar workday.save() sobre un
      // documento viejo que nunca tuvo ese campo — bug real encontrado en
      // producción (2026-09-03). Este doc simula esa jornada vieja.
      const legacyWorkdayDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        // sin clientEntryId, a propósito
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(legacyWorkdayDoc),
      });
      harvestEntryModel.aggregate.mockResolvedValue([
        { total: Types.Decimal128.fromString('50') },
      ]);
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...legacyWorkdayDoc,
          status: 'CLOSED',
          finalTotalKg: Types.Decimal128.fromString('50'),
        }),
      });

      const result = await workdaysService.close(farmId, workdayId);

      expect(result.status).toEqual('CLOSED');
      expect(result.finalTotalKg).toEqual(50);
    });

    it('returns the already-frozen state without re-aggregating when the workday is already closed (idempotent retry)', async () => {
      const closedDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'CLOSED',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        finalTotalKg: Types.Decimal128.fromString('128.5'),
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(closedDoc),
      });

      const result = await workdaysService.close(farmId, workdayId);

      expect(harvestEntryModel.aggregate).not.toHaveBeenCalled();
      expect(result.status).toEqual('CLOSED');
      expect(result.finalTotalKg).toEqual(128.5);
    });

    it('throws NotFoundException when the workday does not exist for the caller farm', async () => {
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        workdaysService.close(farmId, workdayId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException without querying when the id is not a valid ObjectId', async () => {
      await expect(
        workdaysService.close(farmId, 'not-an-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(workdayModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    const workdayId = new Types.ObjectId().toString();

    it('returns the workday when it belongs to the farm', async () => {
      const doc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        fruitId: new Types.ObjectId(fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });

      const result = await workdaysService.findById(farmId, workdayId);

      expect(workdayModel.findOne).toHaveBeenCalledWith({
        _id: workdayId,
        farmId: new Types.ObjectId(farmId),
      });
      expect(result?.status).toEqual('OPEN');
    });

    it('returns null when no matching workday exists for the farm', async () => {
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await workdaysService.findById(farmId, workdayId);

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await workdaysService.findById(farmId, 'not-an-id');

      expect(workdayModel.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});

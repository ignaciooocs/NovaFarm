import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ProductsService } from '../products/products.service';
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

  const productsService = {
    findActiveById: jest.fn(),
  };

  const measurementUnitsService = {
    findActiveById: jest.fn(),
    findAnyById: jest.fn(),
  };

  const usersService = {
    findByFirebaseUid: jest.fn(),
    findNamesByIds: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const productId = '507f1f77bcf86cd799439012';
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
        { provide: ProductsService, useValue: productsService },
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
      productId,
      defaultMeasurementUnitId: measurementUnitId,
    };

    function mockNoExistingClientEntry() {
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
    }

    it('opens a workday and resolves recorderId from the authenticated recorder', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
      });
      const recorderMongoId = new Types.ObjectId();
      usersService.findByFirebaseUid.mockResolvedValue({
        _id: recorderMongoId,
        name: 'Juana Perez',
      });

      workdayModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: recorderMongoId,
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, roles: ['recorder'] },
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
      expect(result.recorderName).toEqual('Juana Perez');
      expect(result.status).toEqual('OPEN');
    });

    it('keeps the device timestamp when the workday was opened offline and uploaded later', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
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
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      });

      await workdaysService.create(
        farmId,
        { uid: 'u', farmId, roles: ['admin'] },
        { ...dto, createdAt: '2026-09-02T08:00:00.000Z' },
      );

      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
        }),
      );
    });

    it('stamps its own clock when the client does not send createdAt', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
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
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date(),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      });

      const before = Date.now();
      await workdaysService.create(
        farmId,
        { uid: 'u', farmId, roles: ['admin'] },
        dto,
      );

      const passed = workdayModel.create.mock.calls[0][0] as {
        createdAt: Date;
      };
      expect(passed.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('leaves recorderId null when opened by an admin (guest mode)', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
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
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date(),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, roles: ['admin'] },
        dto,
      );

      expect(usersService.findByFirebaseUid).not.toHaveBeenCalled();
      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ recorderId: null }),
      );
      expect(result.recorderId).toBeNull();
    });

    it('throws NotFoundException when the product does not exist in the caller farm', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue(null);

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'u', farmId, roles: ['admin'] },
          dto,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(measurementUnitsService.findActiveById).not.toHaveBeenCalled();
      expect(workdayModel.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the measurement unit does not exist in the caller farm', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue(null);

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'u', farmId, roles: ['admin'] },
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
        productId: new Types.ObjectId(productId),
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
        { uid: 'u', farmId, roles: ['admin'] },
        dto,
      );

      expect(workdayModel.findOne).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        clientEntryId: dto.clientEntryId,
      });
      expect(productsService.findActiveById).not.toHaveBeenCalled();
      expect(workdayModel.create).not.toHaveBeenCalled();
      expect(result._id).toEqual(existing._id.toString());
    });

    it('returns the workday from a concurrent duplicate clientEntryId race instead of throwing', async () => {
      const raced = {
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        productId: new Types.ObjectId(productId),
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
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
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
        { uid: 'u', farmId, roles: ['admin'] },
        dto,
      );

      expect(workdayModel.findOne).toHaveBeenCalledTimes(2);
      expect(result._id).toEqual(raced._id.toString());
    });

    it('propagates an unrelated error from create without swallowing it', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
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
          { uid: 'u', farmId, roles: ['admin'] },
          dto,
        ),
      ).rejects.toThrow('boom');
    });

    it('stores the pay rate and its basis when the workday is opened with one', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
        mode: 'COUNT',
      });
      usersService.findByFirebaseUid.mockResolvedValue(null);
      workdayModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        payRate: 500,
        payBasis: 'PER_UNIT',
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, roles: ['admin'] },
        { ...dto, payRate: 500, payBasis: 'PER_UNIT' },
      );

      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ payRate: 500, payBasis: 'PER_UNIT' }),
      );
      expect(result.payRate).toEqual(500);
      expect(result.payBasis).toEqual('PER_UNIT');
    });

    it('opens a workday with no pay at all when no rate is sent', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
        mode: 'COUNT',
      });
      usersService.findByFirebaseUid.mockResolvedValue(null);
      workdayModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        clientEntryId: dto.clientEntryId,
      });

      const result = await workdaysService.create(
        farmId,
        { uid: 'firebase-uid', farmId, roles: ['admin'] },
        dto,
      );

      expect(workdayModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ payRate: null, payBasis: null }),
      );
      expect(result.payRate).toBeNull();
      expect(result.payBasis).toBeNull();
    });

    it('rejects paying per container when the unit is weighed on every round', async () => {
      mockNoExistingClientEntry();
      productsService.findActiveById.mockResolvedValue({
        _id: productId,
        active: true,
      });
      measurementUnitsService.findActiveById.mockResolvedValue({
        _id: measurementUnitId,
        active: true,
        mode: 'WEIGHT',
      });

      await expect(
        workdaysService.create(
          farmId,
          { uid: 'firebase-uid', farmId, roles: ['admin'] },
          { ...dto, payRate: 500, payBasis: 'PER_UNIT' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workdayModel.create).not.toHaveBeenCalled();
    });
  });

  describe('updatePay', () => {
    const workdayId = new Types.ObjectId().toString();

    function mockWorkday(overrides: Record<string, unknown> = {}) {
      const doc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: null,
        clientEntryId: 'local-8f3a2b1c',
        ...overrides,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });
      return doc;
    }

    it('sets the pay on a workday that is still open', async () => {
      const doc = mockWorkday();
      measurementUnitsService.findAnyById.mockResolvedValue({
        _id: measurementUnitId,
        mode: 'COUNT',
      });
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ ...doc, payRate: 500, payBasis: 'PER_UNIT' }),
      });

      const result = await workdaysService.updatePay(farmId, workdayId, {
        payRate: 500,
        payBasis: 'PER_UNIT',
      });

      expect(workdayModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: workdayId, farmId: new Types.ObjectId(farmId) },
        { $set: { payRate: 500, payBasis: 'PER_UNIT' } },
        { new: true },
      );
      expect(result.payRate).toEqual(500);
      expect(result.payBasis).toEqual('PER_UNIT');
    });

    it('clears the basis together with the rate when the pay is removed', async () => {
      mockWorkday({ payRate: 500, payBasis: 'PER_UNIT' });

      await workdaysService.updatePay(farmId, workdayId, {
        payRate: null,
        payBasis: 'PER_UNIT',
      });

      expect(workdayModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: workdayId, farmId: new Types.ObjectId(farmId) },
        { $set: { payRate: null, payBasis: null } },
        { new: true },
      );
      // Sin tarifa no hay nada que validar contra el envase.
      expect(measurementUnitsService.findAnyById).not.toHaveBeenCalled();
    });

    it('validates the basis against the unit even if it was deactivated afterwards', async () => {
      mockWorkday();
      measurementUnitsService.findAnyById.mockResolvedValue({
        _id: measurementUnitId,
        mode: 'WEIGHT',
        active: false,
      });

      await expect(
        workdaysService.updatePay(farmId, workdayId, {
          payRate: 500,
          payBasis: 'PER_UNIT',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workdayModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to change the pay of a closed workday', async () => {
      mockWorkday({ status: 'CLOSED' });

      await expect(
        workdaysService.updatePay(farmId, workdayId, {
          payRate: 500,
          payBasis: 'PER_KG',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(workdayModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the workday does not exist for the caller farm', async () => {
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        workdaysService.updatePay(farmId, workdayId, {
          payRate: 500,
          payBasis: 'PER_KG',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException without querying when the id is not a valid ObjectId', async () => {
      await expect(
        workdaysService.updatePay(farmId, 'not-an-id', {
          payRate: 500,
          payBasis: 'PER_KG',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(workdayModel.findOne).not.toHaveBeenCalled();
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

    it('resolves recorder names in a single batch and skips guest-mode workdays', async () => {
      const recorderAId = new Types.ObjectId();
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          date: new Date('2026-09-01'),
          productId: new Types.ObjectId(productId),
          defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
          status: 'CLOSED',
          createdAt: new Date('2026-09-01T08:00:00.000Z'),
          recorderId: recorderAId,
          clientEntryId: 'local-a',
        },
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          date: new Date('2026-09-02'),
          productId: new Types.ObjectId(productId),
          defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
          status: 'CLOSED',
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
          recorderId: null,
          clientEntryId: 'local-b',
        },
      ];
      workdayModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(docs),
      });
      usersService.findNamesByIds.mockResolvedValue(
        new Map([[recorderAId.toString(), 'Juana Perez']]),
      );

      const result = await workdaysService.findAll(farmId, {
        status: 'CLOSED',
      });

      expect(usersService.findNamesByIds).toHaveBeenCalledWith([recorderAId]);
      expect(result[0].recorderName).toEqual('Juana Perez');
      expect(result[1].recorderName).toBeUndefined();
    });

    it('does not look up recorder names when every workday is guest-mode', async () => {
      const exec = jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          date: new Date('2026-09-01'),
          productId: new Types.ObjectId(productId),
          defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
          status: 'CLOSED',
          createdAt: new Date('2026-09-01T08:00:00.000Z'),
          recorderId: null,
          clientEntryId: 'local-a',
        },
      ]);
      workdayModel.find.mockReturnValue({ exec });

      await workdaysService.findAll(farmId, {});

      expect(usersService.findNamesByIds).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    const workdayId = new Types.ObjectId().toString();

    it('closes an open workday and freezes the aggregated total', async () => {
      const workdayDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        productId: new Types.ObjectId(productId),
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
        productId: new Types.ObjectId(productId),
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
        productId: new Types.ObjectId(productId),
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
        productId: new Types.ObjectId(productId),
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

    it('includes the recorder name when the workday has one attributed', async () => {
      const recorderMongoId = new Types.ObjectId();
      const workdayDoc = {
        _id: new Types.ObjectId(workdayId),
        farmId: new Types.ObjectId(farmId),
        date: new Date('2026-09-02'),
        productId: new Types.ObjectId(productId),
        defaultMeasurementUnitId: new Types.ObjectId(measurementUnitId),
        status: 'OPEN',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recorderId: recorderMongoId,
      };
      workdayModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(workdayDoc),
      });
      harvestEntryModel.aggregate.mockResolvedValue([
        { total: Types.Decimal128.fromString('10') },
      ]);
      workdayModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...workdayDoc,
          status: 'CLOSED',
          finalTotalKg: Types.Decimal128.fromString('10'),
        }),
      });
      usersService.findNamesByIds.mockResolvedValue(
        new Map([[recorderMongoId.toString(), 'Juana Perez']]),
      );

      const result = await workdaysService.close(farmId, workdayId);

      expect(usersService.findNamesByIds).toHaveBeenCalledWith([
        recorderMongoId,
      ]);
      expect(result.recorderName).toEqual('Juana Perez');
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
        productId: new Types.ObjectId(productId),
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

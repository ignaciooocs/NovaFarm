import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Farm } from './schemas/farm.schema';
import {
  FarmsService,
  INVITATION_CODE_TTL_MS,
  isInvitationCodeExpired,
} from './farms.service';

describe('FarmsService', () => {
  let farmsService: FarmsService;

  const farmModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmsService,
        { provide: getModelToken(Farm.name), useValue: farmModel },
      ],
    }).compile();

    farmsService = module.get(FarmsService);
  });

  describe('create', () => {
    it('creates a farm with a generated invitationCode, always active and recorders-can-manage-catalog on', async () => {
      const createdId = new Types.ObjectId();
      farmModel.create.mockResolvedValue({
        _id: createdId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'A1B2C3D4',
        active: true,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recordersCanManageCatalog: true,
      });

      const result = await farmsService.create({
        name: 'Fundo Los Alamos',
        type: 'organization',
      });

      expect(farmModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fundo Los Alamos',
          type: 'organization',
          active: true,
        }),
      );
      expect(result.recordersCanManageCatalog).toBe(true);
    });

    it('gives the new invitationCode an expiry one hour from now', async () => {
      farmModel.create.mockImplementation((doc: object) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          createdAt: new Date(),
          recordersCanManageCatalog: true,
          ...doc,
        }),
      );

      const before = Date.now();
      const result = await farmsService.create({
        name: 'Fundo Los Alamos',
        type: 'organization',
      });

      const expiresAt = result.invitationCodeExpiresAt?.getTime() ?? 0;
      expect(expiresAt).toBeGreaterThanOrEqual(before + INVITATION_CODE_TTL_MS);
      expect(expiresAt).toBeLessThanOrEqual(
        Date.now() + INVITATION_CODE_TTL_MS,
      );
    });

    it('retries with another code when the generated one collides', async () => {
      const duplicate = Object.assign(new Error('E11000'), {
        code: 11000,
        keyPattern: { invitationCode: 1 },
      });
      farmModel.create
        .mockRejectedValueOnce(duplicate)
        .mockImplementationOnce((doc: object) =>
          Promise.resolve({
            _id: new Types.ObjectId(),
            createdAt: new Date(),
            ...doc,
          }),
        );

      await farmsService.create({
        name: 'Fundo Los Alamos',
        type: 'organization',
      });

      expect(farmModel.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('regenerateInvitationCode', () => {
    it('replaces the code and its expiry with a $set scoped to the farm id', async () => {
      const farmId = new Types.ObjectId();
      farmModel.findOneAndUpdate.mockImplementation(
        (
          _filter: object,
          update: {
            $set: { invitationCode: string; invitationCodeExpiresAt: Date };
          },
        ) => ({
          exec: jest.fn().mockResolvedValue({
            _id: farmId,
            name: 'Fundo Los Alamos',
            type: 'organization',
            active: true,
            createdAt: new Date('2026-09-02T08:00:00.000Z'),
            recordersCanManageCatalog: true,
            ...update.$set,
          }),
        }),
      );

      const before = Date.now();
      const result = await farmsService.regenerateInvitationCode(
        farmId.toString(),
      );

      const [filter, update, options] = farmModel.findOneAndUpdate.mock
        .calls[0] as [
        object,
        { $set: { invitationCode: string; invitationCodeExpiresAt: Date } },
        object,
      ];
      expect(filter).toEqual({ _id: farmId.toString() });
      // Mismo alfabeto que generateInvitationCode(): sin 0/O/1/I.
      expect(update.$set.invitationCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(update.$set.invitationCodeExpiresAt).toBeInstanceOf(Date);
      expect(options).toEqual({ new: true });
      expect(result?.invitationCodeExpiresAt?.getTime()).toBeGreaterThanOrEqual(
        before + INVITATION_CODE_TTL_MS,
      );
    });

    it('returns null when no matching farm exists', async () => {
      farmModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await farmsService.regenerateInvitationCode(
        new Types.ObjectId().toString(),
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await farmsService.regenerateInvitationCode('not-an-id');

      expect(farmModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('isInvitationCodeExpired', () => {
    const now = new Date('2026-09-16T15:00:00.000Z');

    it('is not expired before its expiry', () => {
      expect(
        isInvitationCodeExpired(new Date('2026-09-16T15:00:01.000Z'), now),
      ).toBe(false);
    });

    it('is expired at or after its expiry', () => {
      expect(isInvitationCodeExpired(now, now)).toBe(true);
      expect(
        isInvitationCodeExpired(new Date('2026-09-16T14:59:59.000Z'), now),
      ).toBe(true);
    });

    it('treats a farm with no expiry (created before codes expired) as expired', () => {
      expect(isInvitationCodeExpired(null, now)).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns the farm by id', async () => {
      const farmId = new Types.ObjectId();
      const exec = jest.fn().mockResolvedValue({
        _id: farmId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'A1B2C3D4',
        active: true,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recordersCanManageCatalog: false,
      });
      farmModel.findById.mockReturnValue({ exec });

      const result = await farmsService.findById(farmId.toString());

      expect(farmModel.findById).toHaveBeenCalledWith(farmId.toString());
      expect(result?.recordersCanManageCatalog).toBe(false);
    });

    it('defaults recordersCanManageCatalog to true for a farm created before that field existed', async () => {
      // Mongoose solo aplica el `default` del schema al crear, no al leer
      // un documento viejo que nunca tuvo el campo guardado — este test
      // prueba justamente el fallback `?? true` en toDto() (ver el
      // comentario ahí), para no repetir el mismo tipo de bug que causó el
      // ValidationError real de clientEntryId en workdays.
      const farmId = new Types.ObjectId();
      const exec = jest.fn().mockResolvedValue({
        _id: farmId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'A1B2C3D4',
        active: true,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        // sin recordersCanManageCatalog, a propósito — simula una farm vieja
      });
      farmModel.findById.mockReturnValue({ exec });

      const result = await farmsService.findById(farmId.toString());

      expect(result?.recordersCanManageCatalog).toBe(true);
      // Tampoco tiene vencimiento del código: sale null, no undefined, para
      // que isInvitationCodeExpired() la trate como vencida.
      expect(result?.invitationCodeExpiresAt).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await farmsService.findById('not-an-id');

      expect(farmModel.findById).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('updates recordersCanManageCatalog scoped to the farm id', async () => {
      const farmId = new Types.ObjectId();
      farmModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: farmId,
          name: 'Fundo Los Alamos',
          type: 'organization',
          invitationCode: 'A1B2C3D4',
          active: true,
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
          recordersCanManageCatalog: false,
        }),
      });

      const result = await farmsService.update(farmId.toString(), {
        recordersCanManageCatalog: false,
      });

      // findOneAndUpdate con $set puntual, no fetch+mutate+save() — mismo
      // motivo que en workdays.close(): .save() revalidaría el documento
      // completo y reventaría en farms creadas antes de que este campo
      // existiera.
      expect(farmModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: farmId.toString() },
        { $set: { recordersCanManageCatalog: false } },
        { new: true },
      );
      expect(result?.recordersCanManageCatalog).toBe(false);
    });

    it('returns null when no matching farm exists', async () => {
      farmModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await farmsService.update(
        new Types.ObjectId().toString(),
        {
          recordersCanManageCatalog: false,
        },
      );

      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await farmsService.update('not-an-id', {
        recordersCanManageCatalog: false,
      });

      expect(farmModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('findActiveByInvitationCode', () => {
    it('returns the farm when the invitation code matches an active farm', async () => {
      const farmId = new Types.ObjectId();
      const exec = jest.fn().mockResolvedValue({
        _id: farmId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'A1B2C3D4',
        active: true,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        recordersCanManageCatalog: true,
      });
      farmModel.findOne.mockReturnValue({ exec });

      const result = await farmsService.findActiveByInvitationCode('A1B2C3D4');

      expect(farmModel.findOne).toHaveBeenCalledWith({
        invitationCode: 'A1B2C3D4',
        active: true,
      });
      expect(result?._id).toEqual(farmId.toString());
    });

    it('returns null when no matching active farm exists', async () => {
      const exec = jest.fn().mockResolvedValue(null);
      farmModel.findOne.mockReturnValue({ exec });

      const result = await farmsService.findActiveByInvitationCode('NOPE');

      expect(result).toBeNull();
    });
  });
});

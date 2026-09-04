import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;

  const userModel = {
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
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    usersService = module.get(UsersService);
  });

  describe('create', () => {
    it('creates a user scoped to the caller farm, always active', async () => {
      const createdId = new Types.ObjectId();
      userModel.create.mockResolvedValue({
        _id: createdId,
        farmId: new Types.ObjectId(farmId),
        name: 'Juana Perez',
        email: 'juana@example.com',
        role: 'recorder',
        active: true,
      });

      const result = await usersService.create({
        farmId: new Types.ObjectId(farmId),
        name: 'Juana Perez',
        email: 'juana@example.com',
        firebaseUid: 'firebase-uid',
        role: 'recorder',
      });

      expect(userModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        name: 'Juana Perez',
        email: 'juana@example.com',
        firebaseUid: 'firebase-uid',
        role: 'recorder',
        active: true,
      });
      expect(result).toEqual({
        _id: createdId.toString(),
        farmId,
        name: 'Juana Perez',
        email: 'juana@example.com',
        role: 'recorder',
        active: true,
        nationalId: undefined,
      });
    });
  });

  describe('findAll', () => {
    it('lists the team scoped to the caller farm without a filter', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Juana Perez',
          email: 'juana@example.com',
          role: 'admin',
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      userModel.find.mockReturnValue({ exec });

      const result = await usersService.findAll(farmId, {});

      expect(userModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
      });
      expect(result).toEqual([
        {
          _id: docs[0]._id.toString(),
          farmId,
          name: 'Juana Perez',
          email: 'juana@example.com',
          role: 'admin',
          active: true,
          nationalId: undefined,
        },
      ]);
    });

    it('lists the team scoped to the caller farm filtered by active', async () => {
      const exec = jest.fn().mockResolvedValue([]);
      userModel.find.mockReturnValue({ exec });

      await usersService.findAll(farmId, { active: true });

      expect(userModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        active: true,
      });
    });

    it('does not expose firebaseUid in listed results', async () => {
      const docs = [
        {
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Juana Perez',
          email: 'juana@example.com',
          firebaseUid: 'firebase-uid',
          role: 'admin',
          active: true,
        },
      ];
      const exec = jest.fn().mockResolvedValue(docs);
      userModel.find.mockReturnValue({ exec });

      const result = await usersService.findAll(farmId, {});

      expect(result[0]).not.toHaveProperty('firebaseUid');
    });
  });

  describe('findNamesByIds', () => {
    it('resolves a map of id to name with a single $in query', async () => {
      const idA = new Types.ObjectId();
      const idB = new Types.ObjectId();
      const exec = jest.fn().mockResolvedValue([
        { _id: idA, name: 'Juana Perez' },
        { _id: idB, name: 'Pedro Soto' },
      ]);
      const select = jest.fn().mockReturnValue({ exec });
      userModel.find.mockReturnValue({ select });

      const result = await usersService.findNamesByIds([idA, idB]);

      expect(userModel.find).toHaveBeenCalledWith({
        _id: { $in: [idA, idB] },
      });
      expect(select).toHaveBeenCalledWith('name');
      expect(result.get(idA.toString())).toEqual('Juana Perez');
      expect(result.get(idB.toString())).toEqual('Pedro Soto');
    });

    it('returns an empty map without querying when given no ids', async () => {
      const result = await usersService.findNamesByIds([]);

      expect(userModel.find).not.toHaveBeenCalled();
      expect(result.size).toEqual(0);
    });
  });

  describe('findByFirebaseUid', () => {
    it('looks up a user by their Firebase uid', async () => {
      const doc = { _id: new Types.ObjectId(), firebaseUid: 'firebase-uid' };
      const exec = jest.fn().mockResolvedValue(doc);
      userModel.findOne.mockReturnValue({ exec });

      const result = await usersService.findByFirebaseUid('firebase-uid');

      expect(userModel.findOne).toHaveBeenCalledWith({
        firebaseUid: 'firebase-uid',
      });
      expect(result).toEqual(doc);
    });
  });

  describe('findMe', () => {
    it("returns the caller's own profile by firebaseUid", async () => {
      const userId = new Types.ObjectId();
      const exec = jest.fn().mockResolvedValue({
        _id: userId,
        farmId: new Types.ObjectId(farmId),
        name: 'Juana Perez',
        email: 'juana@example.com',
        role: 'recorder',
        active: true,
      });
      userModel.findOne.mockReturnValue({ exec });

      const result = await usersService.findMe('firebase-uid');

      expect(userModel.findOne).toHaveBeenCalledWith({
        firebaseUid: 'firebase-uid',
      });
      expect(result?._id).toEqual(userId.toString());
    });

    it('returns null when no user matches the firebaseUid', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await usersService.findMe('firebase-uid');

      expect(result).toBeNull();
    });
  });

  describe('updateMe', () => {
    it("edits the caller's own name, scoped by firebaseUid", async () => {
      const userId = new Types.ObjectId();
      userModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: userId,
          farmId: new Types.ObjectId(farmId),
          name: 'Juana Gonzalez',
          email: 'juana@example.com',
          role: 'recorder',
          active: true,
        }),
      });

      const result = await usersService.updateMe('firebase-uid', {
        name: 'Juana Gonzalez',
      });

      // findOneAndUpdate con $set puntual, no fetch+mutate+save() — mismo
      // motivo que en workdays.close()/farms.update().
      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        { firebaseUid: 'firebase-uid' },
        { $set: { name: 'Juana Gonzalez' }, $unset: {} },
        { new: true },
      );
      expect(result?.name).toEqual('Juana Gonzalez');
    });

    it('clears an existing nationalId when nationalId is explicitly null ($unset, not $set)', async () => {
      userModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          farmId: new Types.ObjectId(farmId),
          name: 'Juana Perez',
          email: 'juana@example.com',
          role: 'recorder',
          active: true,
        }),
      });

      await usersService.updateMe('firebase-uid', { nationalId: null });

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        { firebaseUid: 'firebase-uid' },
        { $set: {}, $unset: { nationalId: 1 } },
        { new: true },
      );
    });

    it('returns null when no user matches the firebaseUid', async () => {
      userModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await usersService.updateMe('firebase-uid', {
        name: 'Juana Gonzalez',
      });

      expect(result).toBeNull();
    });
  });
});

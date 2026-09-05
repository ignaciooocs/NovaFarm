import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FarmsService } from '../farms/farms.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from './firebase-admin.service';

describe('AuthService', () => {
  let authService: AuthService;

  const usersService = {
    findByFirebaseUid: jest.fn(),
    create: jest.fn(),
  };
  const farmsService = {
    create: jest.fn(),
    findActiveByInvitationCode: jest.fn(),
  };
  const firebaseAdminService = {
    verifyIdToken: jest.fn(),
    setCustomUserClaims: jest.fn(),
  };

  const firebaseUser = { uid: 'firebase-uid-1', email: 'juana@example.com' };
  const farmId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: FarmsService, useValue: farmsService },
        { provide: FirebaseAdminService, useValue: firebaseAdminService },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('registerAdmin', () => {
    it('creates a farm and an admin user, and sets custom claims', async () => {
      usersService.findByFirebaseUid.mockResolvedValue(null);
      farmsService.create.mockResolvedValue({
        _id: farmId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'ABC12345',
        active: true,
        createdAt: new Date(),
      });
      usersService.create.mockResolvedValue({
        _id: 'user-1',
        farmId,
        name: 'Juana Perez',
        email: firebaseUser.email,
        roles: ['admin'],
        active: true,
      });

      const result = await authService.registerAdmin(firebaseUser, {
        name: 'Juana Perez',
        farmName: 'Fundo Los Alamos',
        farmType: 'organization',
      });

      expect(farmsService.create).toHaveBeenCalledWith({
        name: 'Fundo Los Alamos',
        type: 'organization',
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Juana Perez',
          email: firebaseUser.email,
          firebaseUid: firebaseUser.uid,
          roles: ['admin'],
        }),
      );
      expect(firebaseAdminService.setCustomUserClaims).toHaveBeenCalledWith(
        firebaseUser.uid,
        { farmId, roles: ['admin'] },
      );
      expect(result.farm._id).toBe(farmId);
      expect(result.user._id).toBe('user-1');
    });

    it('throws ConflictException when the firebaseUid already onboarded', async () => {
      usersService.findByFirebaseUid.mockResolvedValue({ _id: 'user-1' });

      await expect(
        authService.registerAdmin(firebaseUser, {
          name: 'Juana Perez',
          farmName: 'Fundo Los Alamos',
          farmType: 'organization',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(farmsService.create).not.toHaveBeenCalled();
    });
  });

  describe('registerRecorder', () => {
    it('joins an existing farm and creates a recorder user', async () => {
      usersService.findByFirebaseUid.mockResolvedValue(null);
      farmsService.findActiveByInvitationCode.mockResolvedValue({
        _id: farmId,
        name: 'Fundo Los Alamos',
        type: 'organization',
        invitationCode: 'ABC12345',
        active: true,
        createdAt: new Date(),
      });
      usersService.create.mockResolvedValue({
        _id: 'user-2',
        farmId,
        name: 'Pedro Gonzalez',
        email: firebaseUser.email,
        roles: ['recorder'],
        active: true,
      });

      const result = await authService.registerRecorder(firebaseUser, {
        name: 'Pedro Gonzalez',
        invitationCode: 'ABC12345',
      });

      expect(farmsService.findActiveByInvitationCode).toHaveBeenCalledWith(
        'ABC12345',
      );
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ['recorder'] }),
      );
      expect(firebaseAdminService.setCustomUserClaims).toHaveBeenCalledWith(
        firebaseUser.uid,
        { farmId, roles: ['recorder'] },
      );
      expect(result.farm._id).toBe(farmId);
      expect(result.user._id).toBe('user-2');
    });

    it('throws NotFoundException when the invitation code is invalid', async () => {
      usersService.findByFirebaseUid.mockResolvedValue(null);
      farmsService.findActiveByInvitationCode.mockResolvedValue(null);

      await expect(
        authService.registerRecorder(firebaseUser, {
          name: 'Pedro Gonzalez',
          invitationCode: 'INVALID1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the firebaseUid already onboarded', async () => {
      usersService.findByFirebaseUid.mockResolvedValue({ _id: 'user-1' });

      await expect(
        authService.registerRecorder(firebaseUser, {
          name: 'Pedro Gonzalez',
          invitationCode: 'ABC12345',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(farmsService.findActiveByInvitationCode).not.toHaveBeenCalled();
    });
  });
});

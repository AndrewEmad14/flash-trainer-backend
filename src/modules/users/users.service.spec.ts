import { AppException } from '../../common/errors/app.exception';
import { DetailCode, ErrorCode } from '../../common/errors/error-codes';
import type { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const data = {
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  phone: '+201001234567',
  passwordHash: 'hash',
};

describe('UsersService', () => {
  const repository = {
    findConflicts: jest.fn(),
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    markEmailVerified: jest.fn(),
  };
  const service = new UsersService(repository as unknown as UsersRepository);

  beforeEach(() => jest.resetAllMocks());

  describe('createUser', () => {
    it('should create the user when no identity field is taken', async () => {
      repository.findConflicts.mockResolvedValue([]);
      repository.create.mockResolvedValue({ id: 'u1', ...data });

      await expect(service.createUser(data)).resolves.toMatchObject({ id: 'u1' });
      expect(repository.findConflicts).toHaveBeenCalledWith({
        email: 'ahmed@mail.com',
        username: 'Ahmed_A',
        phone: '+201001234567',
      });
    });

    it('should throw USER_IDENTITY_TAKEN listing every conflict, in a fixed order', async () => {
      repository.findConflicts.mockResolvedValue(['phone', 'email']);

      const error = await service.createUser(data).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({ code: ErrorCode.USER_IDENTITY_TAKEN });
      expect((error as AppException).details?.map((d) => d.code)).toEqual([
        DetailCode.USER_EMAIL_TAKEN,
        DetailCode.USER_PHONE_TAKEN,
      ]);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByIdentifier', () => {
    it('should treat values with @ as an email, lowercased and trimmed', async () => {
      repository.findByEmail.mockResolvedValue({ id: 'u1' });

      await expect(service.findByIdentifier(' AHMED@Mail.com ')).resolves.toEqual({ id: 'u1' });
      expect(repository.findByEmail).toHaveBeenCalledWith('ahmed@mail.com');
      expect(repository.findByUsername).not.toHaveBeenCalled();
    });

    it('should treat other values as a username', async () => {
      repository.findByUsername.mockResolvedValue(null);

      await expect(service.findByIdentifier(' Ahmed_A ')).resolves.toBeNull();
      expect(repository.findByUsername).toHaveBeenCalledWith('Ahmed_A');
    });
  });

  describe('getMe', () => {
    it('should return the public view of the account', async () => {
      repository.findById.mockResolvedValue({
        id: 'u1',
        fullName: 'Ahmed Ali',
        username: 'Ahmed_A',
        email: 'ahmed@mail.com',
        emailVerifiedAt: null,
        phone: null,
        passwordHash: 'secret-hash',
        createdAt: new Date('2026-11-25T10:00:00.000Z'),
        updatedAt: new Date('2026-11-25T10:00:00.000Z'),
      });

      const me = await service.getMe('u1');

      expect(repository.findById).toHaveBeenCalledWith('u1');
      expect(me).toEqual({
        id: 'u1',
        fullName: 'Ahmed Ali',
        username: 'Ahmed_A',
        email: 'ahmed@mail.com',
        isEmailVerified: false,
        phone: null,
        createdAt: '2026-11-25T10:00:00.000Z',
      });
    });

    it('should throw AUTH_TOKEN_INVALID when the account no longer exists', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getMe('gone')).rejects.toMatchObject({
        code: ErrorCode.AUTH_TOKEN_INVALID,
      });
    });
  });

  describe('findById / markEmailVerified', () => {
    it('should delegate to the repository', async () => {
      repository.findById.mockResolvedValue(null);
      repository.markEmailVerified.mockResolvedValue(true);

      await expect(service.findById('u1')).resolves.toBeNull();
      await expect(service.markEmailVerified('u1')).resolves.toBe(true);
      expect(repository.markEmailVerified).toHaveBeenCalledWith('u1');
    });
  });
});

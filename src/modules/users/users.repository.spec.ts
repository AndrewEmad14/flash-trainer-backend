import { AppException } from '../../common/errors/app.exception';
import { DetailCode, ErrorCode } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { UsersRepository } from './users.repository';

const data = {
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  phone: null,
  passwordHash: 'hash',
};

const uniqueError = (meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta,
  });

describe('UsersRepository', () => {
  const user = { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
  const repository = new UsersRepository({ user } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  describe('create', () => {
    it('should insert and return the user', async () => {
      user.create.mockResolvedValue({ id: 'u1', ...data });

      await expect(repository.create(data)).resolves.toMatchObject({ id: 'u1' });
      expect(user.create).toHaveBeenCalledWith({ data });
    });

    it.each([
      [{ target: ['email'] }, [DetailCode.USER_EMAIL_TAKEN]],
      [
        { driverAdapterError: { cause: { constraint: { fields: ['username'] } } } },
        [DetailCode.USER_USERNAME_TAKEN],
      ],
      [{ target: 'users_phone_key' }, [DetailCode.USER_PHONE_TAKEN]],
    ])('should map a unique violation %p to USER_IDENTITY_TAKEN', async (meta, codes) => {
      user.create.mockRejectedValue(uniqueError(meta));

      const error = await repository.create(data).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({ code: ErrorCode.USER_IDENTITY_TAKEN });
      expect((error as AppException).details?.map((d) => d.code)).toEqual(codes);
    });

    it('should rethrow other database errors untouched', async () => {
      const failure = new Error('connection lost');
      user.create.mockRejectedValue(failure);

      await expect(repository.create(data)).rejects.toBe(failure);
    });
  });

  describe('findById', () => {
    it('should look the user up by id', async () => {
      user.findUnique.mockResolvedValue(null);

      await expect(repository.findById('u1')).resolves.toBeNull();
      expect(user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('findByEmail / findByUsername', () => {
    it('should look users up by their unique email or username', async () => {
      user.findUnique.mockResolvedValue(null);

      await repository.findByEmail('ahmed@mail.com');
      await repository.findByUsername('ahmed_a');

      expect(user.findUnique).toHaveBeenNthCalledWith(1, { where: { email: 'ahmed@mail.com' } });
      expect(user.findUnique).toHaveBeenNthCalledWith(2, { where: { username: 'ahmed_a' } });
    });
  });

  describe('findConflicts', () => {
    const lookup = { email: 'ahmed@mail.com', username: 'Ahmed_A', phone: '+201001234567' };

    it('should report every conflicting field, matching usernames case-insensitively', async () => {
      user.findMany.mockResolvedValue([
        { email: 'ahmed@mail.com', username: 'someone', phone: null },
        { email: 'other@mail.com', username: 'ahmed_a', phone: '+201001234567' },
      ]);

      await expect(repository.findConflicts(lookup)).resolves.toEqual([
        'email',
        'username',
        'phone',
      ]);
    });

    it('should return no conflicts when nothing matches', async () => {
      user.findMany.mockResolvedValue([]);

      await expect(repository.findConflicts(lookup)).resolves.toEqual([]);
    });

    it('should not query or report phone when none is given', async () => {
      user.findMany.mockResolvedValue([{ email: 'x@y.z', username: 'x', phone: null }]);

      await expect(repository.findConflicts({ ...lookup, phone: null })).resolves.toEqual([]);
      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ email: 'ahmed@mail.com' }, { username: 'Ahmed_A' }] },
        }),
      );
    });
  });
});

import type { PrismaService } from '../../../prisma/prisma.service';
import { PasswordResetsRepository } from './password-resets.repository';

describe('PasswordResetsRepository', () => {
  const passwordReset = {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const repository = new PasswordResetsRepository({ passwordReset } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('should create a request with the token hash and expiry', async () => {
    const data = { userId: 'u1', tokenHash: 'h', expiresAt: new Date('2026-11-25T11:00:00Z') };
    passwordReset.create.mockResolvedValue({ id: 'r1', ...data });

    await expect(repository.create(data)).resolves.toMatchObject({ id: 'r1' });
    expect(passwordReset.create).toHaveBeenCalledWith({ data });
  });

  it("should delete only the user's unused requests", async () => {
    await repository.deleteUnusedForUser('u1');

    expect(passwordReset.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
    });
  });

  it('should find a request by token hash', async () => {
    passwordReset.findUnique.mockResolvedValue(null);

    await expect(repository.findByTokenHash('h')).resolves.toBeNull();
    expect(passwordReset.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'h' } });
  });

  it('should claim a request only once', async () => {
    passwordReset.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(repository.markUsed('r1')).resolves.toBe(true);
    await expect(repository.markUsed('r1')).resolves.toBe(false);
    expect(passwordReset.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
});

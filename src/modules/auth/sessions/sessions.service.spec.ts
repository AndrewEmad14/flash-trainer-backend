import { ErrorCode } from '../../../common/errors/error-codes';
import { sha256Hex } from '../../../common/utils/hash.util';
import type { TokenService } from '../tokens/token.service';
import type { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const repository = {
    create: jest.fn(),
    findByRefreshTokenHash: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    listActive: jest.fn(),
    findActiveByIdForUser: jest.fn(),
    setPushToken: jest.fn(),
  };
  const tokens = { issueRefreshToken: jest.fn(), signAccessToken: jest.fn() };
  const service = new SessionsService(
    repository as unknown as SessionsRepository,
    tokens as unknown as TokenService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    tokens.issueRefreshToken.mockReturnValue({
      token: 'refresh-plain',
      hash: 'refresh-hash',
      expiresAt: new Date('2026-12-25T10:00:00.000Z'),
    });
    tokens.signAccessToken.mockResolvedValue({
      token: 'access-jwt',
      expiresAt: new Date('2026-11-25T10:15:00.000Z'),
    });
    repository.create.mockResolvedValue({ id: 'session-1' });
  });

  describe('createSession', () => {
    it('should store only the refresh hash and bind the access token to the session', async () => {
      const result = await service.createSession('user-1', {
        deviceName: 'Pixel 9',
        deviceOs: 'Android 16',
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        refreshTokenHash: 'refresh-hash',
        deviceName: 'Pixel 9',
        deviceOs: 'Android 16',
        expiresAt: new Date('2026-12-25T10:00:00.000Z'),
      });
      expect(tokens.signAccessToken).toHaveBeenCalledWith({ sub: 'user-1', sid: 'session-1' });
      expect(result).toEqual({
        tokenType: 'Bearer',
        accessToken: 'access-jwt',
        accessTokenExpiresAt: '2026-11-25T10:15:00.000Z',
        refreshToken: 'refresh-plain',
        refreshTokenExpiresAt: '2026-12-25T10:00:00.000Z',
      });
    });

    it('should store null device details when none are given', async () => {
      await service.createSession('user-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceName: null, deviceOs: null }),
      );
    });
  });

  describe('refresh', () => {
    const NOW = new Date('2026-11-25T10:00:00.000Z');
    const active = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    };

    beforeEach(() => jest.useFakeTimers({ now: NOW }));
    afterEach(() => jest.useRealTimers());

    it('should rotate the token, slide the expiry and keep the same session', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue(active);
      repository.rotate.mockResolvedValue(true);

      const result = await service.refresh('old-token');

      expect(repository.findByRefreshTokenHash).toHaveBeenCalledWith(sha256Hex('old-token'));
      expect(repository.rotate).toHaveBeenCalledWith('session-1', sha256Hex('old-token'), {
        refreshTokenHash: 'refresh-hash',
        expiresAt: new Date('2026-12-25T10:00:00.000Z'),
        lastUsedAt: NOW,
      });
      expect(tokens.signAccessToken).toHaveBeenCalledWith({ sub: 'user-1', sid: 'session-1' });
      expect(result.refreshToken).toBe('refresh-plain');
    });

    it.each([
      ['unknown', null],
      ['revoked', { ...active, revokedAt: new Date('2026-11-20T00:00:00Z') }],
    ])('should reject an %s session with AUTH_SESSION_INVALID', async (_state, session) => {
      repository.findByRefreshTokenHash.mockResolvedValue(session);

      await expect(service.refresh('t')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
      expect(repository.rotate).not.toHaveBeenCalled();
    });

    it('should reject a session idle past its expiry with AUTH_SESSION_EXPIRED', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue({ ...active, expiresAt: NOW });

      await expect(service.refresh('t')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_EXPIRED,
      });
    });

    it('should reject when a concurrent refresh already rotated the token', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue(active);
      repository.rotate.mockResolvedValue(false);

      await expect(service.refresh('t')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
      expect(tokens.signAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('logoutByRefreshToken', () => {
    it('should revoke the active session that owns the token', async () => {
      repository.findByRefreshTokenHash.mockResolvedValue({ id: 's1', revokedAt: null });

      await service.logoutByRefreshToken('plain');

      expect(repository.findByRefreshTokenHash).toHaveBeenCalledWith(sha256Hex('plain'));
      expect(repository.revoke).toHaveBeenCalledWith('s1');
    });

    it.each([
      ['unknown', null],
      ['already revoked', { id: 's1', revokedAt: new Date() }],
    ])('should do nothing, without failing, for an %s token', async (_case, session) => {
      repository.findByRefreshTokenHash.mockResolvedValue(session);

      await expect(service.logoutByRefreshToken('plain')).resolves.toBeUndefined();
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('revokeAll', () => {
    it('should revoke every session, or all but one', async () => {
      repository.revokeAllForUser.mockResolvedValue(3);

      await expect(service.revokeAll('u1')).resolves.toBe(3);
      await service.revokeAll('u1', 's2');

      expect(repository.revokeAllForUser).toHaveBeenNthCalledWith(1, 'u1', {});
      expect(repository.revokeAllForUser).toHaveBeenNthCalledWith(2, 'u1', {
        exceptSessionId: 's2',
      });
    });
  });

  describe('listForUser', () => {
    it('should map active sessions and mark the current one', async () => {
      const base = {
        userId: 'u1',
        deviceName: null,
        deviceOs: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        lastUsedAt: new Date('2026-11-25T00:00:00Z'),
      };
      repository.listActive.mockResolvedValue([
        { ...base, id: 's2' },
        { ...base, id: 's1' },
      ]);

      const result = await service.listForUser('u1', 's1');

      expect(repository.listActive).toHaveBeenCalledWith('u1');
      expect(result.map((s) => [s.id, s.isCurrent])).toEqual([
        ['s2', false],
        ['s1', true],
      ]);
    });
  });

  describe('revokeOwnSession', () => {
    it("should revoke the user's own active session", async () => {
      repository.findActiveByIdForUser.mockResolvedValue({ id: 's2' });

      await service.revokeOwnSession('u1', 's2');

      expect(repository.findActiveByIdForUser).toHaveBeenCalledWith('s2', 'u1');
      expect(repository.revoke).toHaveBeenCalledWith('s2');
    });

    it('should throw SESSION_NOT_FOUND for a missing, inactive or foreign session', async () => {
      repository.findActiveByIdForUser.mockResolvedValue(null);

      await expect(service.revokeOwnSession('u1', 'x')).rejects.toMatchObject({
        code: ErrorCode.SESSION_NOT_FOUND,
      });
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('updatePushToken', () => {
    it('should save the token on the session', async () => {
      repository.setPushToken.mockResolvedValue(true);

      await service.updatePushToken('s1', 'fcm');

      expect(repository.setPushToken).toHaveBeenCalledWith('s1', 'fcm');
    });

    it('should throw AUTH_SESSION_INVALID when the session is no longer active', async () => {
      repository.setPushToken.mockResolvedValue(false);

      await expect(service.updatePushToken('s1', 'fcm')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
    });
  });
});

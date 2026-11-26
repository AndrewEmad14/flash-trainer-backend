import { ErrorCode } from '../../../common/errors/error-codes';
import { sha256Hex } from '../../../common/utils/hash.util';
import type { TokenService } from '../tokens/token.service';
import type { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const repository = { create: jest.fn(), findByRefreshTokenHash: jest.fn(), rotate: jest.fn() };
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
});

import type { TokenService } from '../tokens/token.service';
import type { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const repository = { create: jest.fn() };
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
});

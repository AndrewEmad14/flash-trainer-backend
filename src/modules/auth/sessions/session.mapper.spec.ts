import type { AuthSession } from '../../../generated/prisma/client';
import { toSessionResponse } from './session.mapper';

const session: AuthSession = {
  id: 's1',
  userId: 'u1',
  refreshTokenHash: 'h'.repeat(64),
  deviceName: 'Pixel 9',
  deviceOs: null,
  fcmToken: 'fcm-secret',
  createdAt: new Date('2026-11-01T08:00:00.000Z'),
  lastUsedAt: new Date('2026-11-25T10:00:00.000Z'),
  expiresAt: new Date('2026-12-25T10:00:00.000Z'),
  revokedAt: null,
};

describe('toSessionResponse', () => {
  it('should map public fields, mark the current device and hide secrets', () => {
    const mapped = toSessionResponse(session, 's1');

    expect(mapped).toEqual({
      id: 's1',
      deviceName: 'Pixel 9',
      deviceOs: null,
      createdAt: '2026-11-01T08:00:00.000Z',
      lastUsedAt: '2026-11-25T10:00:00.000Z',
      isCurrent: true,
    });
    expect(JSON.stringify(mapped)).not.toMatch(/fcm-secret|hhhh/);
  });

  it('should mark other devices as not current', () => {
    expect(toSessionResponse(session, 'other').isCurrent).toBe(false);
  });
});

import type { User } from '../../generated/prisma/client';
import { toUserResponse } from './user.mapper';

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u-1',
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  emailVerifiedAt: null,
  phone: null,
  passwordHash: '$argon2id$secret',
  createdAt: new Date('2026-11-25T10:15:00.000Z'),
  updatedAt: new Date('2026-11-25T10:15:00.000Z'),
  ...overrides,
});

describe('toUserResponse', () => {
  it('should map public fields and never include the password hash', () => {
    expect(toUserResponse(user())).toEqual({
      id: 'u-1',
      fullName: 'Ahmed Ali',
      username: 'Ahmed_A',
      email: 'ahmed@mail.com',
      isEmailVerified: false,
      phone: null,
      createdAt: '2026-11-25T10:15:00.000Z',
    });
  });

  it('should report a verified email and keep the phone', () => {
    const mapped = toUserResponse(
      user({ emailVerifiedAt: new Date('2026-11-26T00:00:00Z'), phone: '+201001234567' }),
    );

    expect(mapped.isEmailVerified).toBe(true);
    expect(mapped.phone).toBe('+201001234567');
  });
});

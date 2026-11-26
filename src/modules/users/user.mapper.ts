import type { User } from '../../generated/prisma/client';
import type { UserResponseDto } from './dto/user-response.dto';

/**
 * Maps a stored user to its public shape. `passwordHash` is deliberately never copied
 * (FR-015, FR-032). Missing optional values become `null` (constitution §III.4).
 *
 * @param user - The Prisma user row.
 * @returns The API representation.
 */
export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    isEmailVerified: user.emailVerifiedAt !== null,
    phone: user.phone ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

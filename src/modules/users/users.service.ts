import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { normalizeEmail } from '../../common/utils/normalize.util';
import type { UserResponseDto } from './dto/user-response.dto';
import { toUserResponse } from './user.mapper';
import { identityTakenException } from './user-identity.errors';
import { UsersRepository, type CreateUserData } from './users.repository';

/** Business rules for accounts. Other modules use this, never the repository (§I). */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /**
   * Creates an account after checking every identity field at once, so the client sees all
   * conflicts in one response (FR-006, research R9).
   *
   * @param data - Normalised account data with an already-hashed password.
   * @returns The created user.
   * @throws AppException USER_IDENTITY_TAKEN listing every field already in use.
   */
  async createUser(data: CreateUserData): Promise<User> {
    const conflicts = await this.users.findConflicts({
      email: data.email,
      username: data.username,
      phone: data.phone,
    });
    if (conflicts.length > 0) {
      throw identityTakenException(conflicts);
    }
    return this.users.create(data);
  }

  /**
   * Resolves a sign-in identifier (research R10): a value containing `@` is an email, matched
   * after lowercasing; anything else is a username, matched case-insensitively. Usernames
   * can't contain `@` (FR-004), so this is unambiguous.
   *
   * @param identifier - Email or username as entered.
   * @returns The matching user, or `null`.
   */
  findByIdentifier(identifier: string): Promise<User | null> {
    const value = identifier.trim();
    return value.includes('@')
      ? this.users.findByEmail(String(normalizeEmail(value)))
      : this.users.findByUsername(value);
  }

  /**
   * The signed-in user's own account (US4, FR-015).
   *
   * @param userId - From the verified access token.
   * @returns The public account view (never contains secrets).
   * @throws AppException AUTH_TOKEN_INVALID when the account was deleted after the access
   *   token was issued. The token is still validly signed, but it no longer identifies anyone.
   */
  async getMe(userId: string): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppException(ErrorCode.AUTH_TOKEN_INVALID);
    return toUserResponse(user);
  }

  /** The user with this id, or `null` (internal use; controllers use {@link getMe}). */
  findById(userId: string): Promise<User | null> {
    return this.users.findById(userId);
  }

  /**
   * Marks the email as verified (US7). Idempotent.
   *
   * @returns `true` if this call verified it, `false` if it already was.
   */
  markEmailVerified(userId: string): Promise<boolean> {
    return this.users.markEmailVerified(userId);
  }
}

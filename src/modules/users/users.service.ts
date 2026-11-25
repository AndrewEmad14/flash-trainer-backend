import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
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
}

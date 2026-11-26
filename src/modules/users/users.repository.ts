import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IDENTITY_FIELDS,
  identityTakenException,
  type IdentityField,
} from './user-identity.errors';

export interface CreateUserData {
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  passwordHash: string;
}

export interface IdentityLookup {
  email: string;
  username: string;
  phone: string | null;
}

const UNIQUE_VIOLATION = 'P2002';

/**
 * Works out which identity fields a unique violation hit. With Prisma 7 driver adapters the
 * metadata shape varies (`target` vs. `driverAdapterError.cause.constraint`), so this
 * searches the serialised metadata for the column names instead of relying on one shape.
 */
function fieldsFromUniqueViolation(error: Prisma.PrismaClientKnownRequestError): IdentityField[] {
  const meta = JSON.stringify(error.meta ?? {});
  return IDENTITY_FIELDS.filter((field) => meta.includes(field));
}

/** The only place that touches the `users` table (constitution §I). */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts a user. A unique-constraint race (two simultaneous sign-ups) is translated to
   * the same 409 the service would have returned (research R9, spec edge case 1).
   *
   * @throws AppException USER_IDENTITY_TAKEN when email, username or phone is already used.
   */
  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw identityTakenException(fieldsFromUniqueViolation(error));
      }
      throw error;
    }
  }

  /** Finds a user by exact (already lowercased) email, or `null`. */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Finds a user by username, ignoring letter case (citext), or `null`. */
  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /** Finds a user by id, or `null`. */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Returns which of the given identity values are already used, in one query.
   * Username matching ignores case (citext). Email is already lowercased by the DTO.
   *
   * @returns The conflicting fields, in reporting order.
   */
  async findConflicts(lookup: IdentityLookup): Promise<IdentityField[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: lookup.email },
          { username: lookup.username },
          ...(lookup.phone ? [{ phone: lookup.phone }] : []),
        ],
      },
      select: { email: true, username: true, phone: true },
    });
    const conflicts: IdentityField[] = [];
    if (rows.some((row) => row.email === lookup.email)) conflicts.push('email');
    if (rows.some((row) => row.username.toLowerCase() === lookup.username.toLowerCase())) {
      conflicts.push('username');
    }
    if (lookup.phone && rows.some((row) => row.phone === lookup.phone)) conflicts.push('phone');
    return conflicts;
  }

  /**
   * Sets `emailVerifiedAt` if it isn't set yet (data-model.md User.emailVerifiedAt).
   * Idempotent and race-safe: a second call changes nothing.
   *
   * @returns `true` if this call verified the email.
   */
  async markEmailVerified(id: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    return count === 1;
  }

  /** Replaces the stored password hash (data-model.md User.passwordHash). */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /**
   * Permanently deletes a user. The database cascades to sessions, reset requests and email
   * dispatches (data-model.md AuthSession.userId, PasswordReset.userId, EmailDispatch.userId).
   *
   * @returns `false` if the user was already gone (e.g. a simultaneous delete).
   */
  async deleteById(id: string): Promise<boolean> {
    const { count } = await this.prisma.user.deleteMany({ where: { id } });
    return count === 1;
  }
}

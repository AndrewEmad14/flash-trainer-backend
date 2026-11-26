import { Injectable } from '@nestjs/common';
import type { PasswordReset } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** The only place that touches `password_resets` (data-model.md PasswordReset). */
@Injectable()
export class PasswordResetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores a new reset request (only the token's hash). */
  create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordReset> {
    return this.prisma.passwordReset.create({ data });
  }

  /** Deletes the user's earlier unused requests, so older links stop working (FR-024). */
  async deleteUnusedForUser(userId: string): Promise<void> {
    await this.prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });
  }

  /** The request holding this token hash (any state), or `null`. */
  findByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
    return this.prisma.passwordReset.findUnique({ where: { tokenHash } });
  }

  /**
   * Claims the request as a compare-and-swap: only succeeds while `used_at` is still empty,
   * so a link can be used once even under simultaneous requests.
   *
   * @returns `true` if this call claimed it.
   */
  async markUsed(id: string): Promise<boolean> {
    const { count } = await this.prisma.passwordReset.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Cleanup (R16): deletes reset requests created before `cutoff` (used or expired by then).
   *
   * @returns How many rows were deleted.
   */
  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.passwordReset.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}

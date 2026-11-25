import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** OWASP-recommended argon2id parameters (research R11): 19 MiB, 2 iterations, 1 lane. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes and verifies passwords. Plain passwords never leave this service. */
@Injectable()
export class PasswordHasherService {
  private dummyHash?: Promise<string>;

  /**
   * @param password - The plain password.
   * @returns An argon2id hash (includes salt and parameters).
   */
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * @param hash - A stored argon2 hash.
   * @param password - The candidate password.
   * @returns `true` if they match. A malformed hash counts as no match.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real verification and always fails. Used when the account
   * doesn't exist, so response timing doesn't reveal which emails are registered (research R5).
   *
   * @param password - The candidate password.
   * @returns Always `false`.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-only-1');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}

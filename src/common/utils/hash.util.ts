import { createHash, randomBytes } from 'node:crypto';

/** Bytes of entropy in refresh and reset tokens (research R1, R4). */
export const OPAQUE_TOKEN_BYTES = 32;

/**
 * SHA-256 of a high-entropy secret, as 64 hex chars. Used for refresh and reset tokens,
 * which can't be brute-forced the way passwords can (research R1). Passwords use argon2id.
 *
 * @param value - The secret to hash.
 * @returns Lowercase hex digest.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Generates a random URL-safe token.
 *
 * @param bytes - Bytes of entropy (default 32).
 * @returns A base64url string.
 */
export function generateOpaqueToken(bytes: number = OPAQUE_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

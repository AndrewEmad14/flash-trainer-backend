import { randomUUID } from 'node:crypto';

/** Fields that must never appear in logs (constitution Observability; tasks T032, T120). */
export const REDACTED_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.pushToken',
];

const TOKEN_QUERY = /([?&](?:token|refreshToken)=)[^&#]*/gi;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Masks secret query parameters (email-link tokens) in a URL before it is logged.
 *
 * @param url - A request URL, e.g. `/api/v1/links/verify-email?token=abc`.
 * @returns The URL with token values replaced by `[REDACTED]`.
 */
export function redactUrl(url: string): string {
  return url.replace(TOKEN_QUERY, '$1[REDACTED]');
}

/**
 * Picks the request ID: the client's `X-Request-Id` if it is safe to echo, otherwise a
 * new UUID. This ID ends up in `meta.requestId`, the response header and every log line.
 *
 * @param incoming - The raw `X-Request-Id` header value.
 * @returns The request ID to use.
 */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate !== undefined && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

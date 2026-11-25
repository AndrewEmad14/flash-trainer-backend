import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { ErrorDetail } from '../errors/app.exception';
import type { ErrorCode } from '../errors/error-codes';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface EnvelopeMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: EnvelopeMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: readonly ErrorDetail[];
  };
  meta: EnvelopeMeta;
}

/**
 * Returns the request ID assigned by the logger middleware (taken from `X-Request-Id`,
 * or generated). Falls back to a fresh UUID, stored on the request, so `meta.requestId`
 * is always present and stable for the whole request.
 *
 * @param request - The current Express request.
 * @returns The request ID as a string.
 */
export function getRequestId(request: Request): string {
  const carrier = request as Request & { id?: unknown };
  if (typeof carrier.id === 'string' && carrier.id.length > 0) return carrier.id;
  if (typeof carrier.id === 'number') return String(carrier.id);
  // Errors raised before the logger middleware (e.g. malformed JSON) have no id yet.
  // Assign one so meta.requestId and the X-Request-Id header still agree.
  const generated = randomUUID();
  carrier.id = generated;
  return generated;
}

/**
 * Builds the `meta` block shared by every envelope (constitution §III.1).
 *
 * @param request - The current Express request.
 * @param pagination - Present only for paginated lists.
 * @returns The envelope meta.
 */
export function buildMeta(request: Request, pagination?: PaginationMeta): EnvelopeMeta {
  return {
    requestId: getRequestId(request),
    timestamp: new Date().toISOString(),
    ...(pagination ? { pagination } : {}),
  };
}

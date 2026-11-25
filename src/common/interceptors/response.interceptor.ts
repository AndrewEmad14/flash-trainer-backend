import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';
import { buildMeta, type SuccessEnvelope } from '../http/envelope';
import { PaginatedResult } from '../http/paginated-result';

/**
 * Wraps every successful JSON response as `{ success: true, data, meta }` (§III.1).
 * `undefined` becomes `data: null`. A {@link PaginatedResult} puts its pagination in `meta`.
 * Handlers marked `@SkipEnvelope()` (non-API pages) are left untouched.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip === true || context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(map((value: unknown) => this.wrap(value, request)));
  }

  private wrap(value: unknown, request: Request): SuccessEnvelope<unknown> {
    if (value instanceof PaginatedResult) {
      return { success: true, data: value.items, meta: buildMeta(request, value.pagination) };
    }
    return { success: true, data: value ?? null, meta: buildMeta(request) };
  }
}

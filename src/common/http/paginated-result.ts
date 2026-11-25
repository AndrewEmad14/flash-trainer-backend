import type { PaginationMeta } from './envelope';

/**
 * Return this from a controller to get a paginated envelope: `items` becomes `data`,
 * and `pagination` goes into `meta`.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: readonly T[],
    readonly pagination: PaginationMeta,
  ) {}
}

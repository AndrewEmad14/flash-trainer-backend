/**
 * Every JSON endpoint of the API, the single list used by the cross-cutting error suite
 * (T125) and the OpenAPI completeness suite (T119). Both suites fail if the generated
 * OpenAPI document contains an operation missing from this list, so new endpoints can't skip
 * the shared checks.
 *
 * Excluded on purpose: `GET /health` (infrastructure) and `GET /links/:type` (HTML landing
 * page, constitution §III.1 non-API exemption).
 */
export interface EndpointSpec {
  method: 'get' | 'post' | 'put' | 'delete';
  /** Path after `/api/v1`, with `:param` placeholders. */
  path: string;
  isPublic: boolean;
  /** `auth` = the 10/min `@AuthThrottle()`; `default` = the global 100/min. */
  throttle: 'auth' | 'default';
  /** A body that fails validation, for endpoints that take a body. */
  invalidBody?: Record<string, unknown>;
}

export const ENDPOINTS: readonly EndpointSpec[] = [
  { method: 'post', path: '/auth/register', isPublic: true, throttle: 'auth', invalidBody: {} },
  { method: 'post', path: '/auth/login', isPublic: true, throttle: 'auth', invalidBody: {} },
  { method: 'post', path: '/auth/refresh', isPublic: true, throttle: 'auth', invalidBody: {} },
  { method: 'post', path: '/auth/logout', isPublic: true, throttle: 'default', invalidBody: {} },
  { method: 'post', path: '/auth/logout-all', isPublic: false, throttle: 'default' },
  { method: 'put', path: '/auth/password', isPublic: false, throttle: 'auth', invalidBody: {} },
  { method: 'get', path: '/auth/sessions', isPublic: false, throttle: 'default' },
  { method: 'delete', path: '/auth/sessions/:sessionId', isPublic: false, throttle: 'default' },
  {
    method: 'put',
    path: '/auth/sessions/current/push-token',
    isPublic: false,
    throttle: 'default',
    invalidBody: {},
  },
  { method: 'post', path: '/auth/email-verification', isPublic: false, throttle: 'auth' },
  {
    method: 'post',
    path: '/auth/email-verification/confirm',
    isPublic: true,
    throttle: 'auth',
    invalidBody: {},
  },
  {
    method: 'post',
    path: '/auth/password-reset',
    isPublic: true,
    throttle: 'auth',
    invalidBody: { email: 'not-an-email' },
  },
  {
    method: 'post',
    path: '/auth/password-reset/confirm',
    isPublic: true,
    throttle: 'auth',
    invalidBody: {},
  },
  { method: 'get', path: '/users/me', isPublic: false, throttle: 'default' },
  { method: 'delete', path: '/users/me', isPublic: false, throttle: 'auth', invalidBody: {} },
];

/** Operations deliberately outside {@link ENDPOINTS}. */
export const EXCLUDED_OPERATIONS = ['get /health', 'get /links/{type}'];

/** `/auth/sessions/:sessionId` → `/auth/sessions/{sessionId}` (OpenAPI style). */
export const toOpenApiPath = (path: string): string => path.replace(/:(\w+)/g, '{$1}');

/** Fills path parameters with a syntactically valid value. */
export const concretePath = (path: string): string =>
  `/api/v1${path.replace(/:(\w+)/g, '00000000-0000-4000-8000-000000000000')}`;

/** `get /users/me` style keys for every operation in an OpenAPI document (prefix removed). */
export function openApiOperationKeys(document: { paths: Record<string, object> }): string[] {
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method} ${path.replace(/^\/api\/v1/, '')}`),
  );
}

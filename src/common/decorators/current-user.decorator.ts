import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthenticatedRequest, AuthenticatedUser } from '../http/authenticated-request';

/**
 * Resolves the signed-in user for a protected route.
 *
 * @throws AppException AUTH_TOKEN_MISSING if used on a route the guard didn't authenticate.
 */
export function resolveCurrentUser(_data: unknown, context: ExecutionContext): AuthenticatedUser {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new AppException(ErrorCode.AUTH_TOKEN_MISSING);
  }
  return request.user;
}

/** Injects `{ userId, sessionId }` of the signed-in user into a controller method. */
export const CurrentUser = createParamDecorator(resolveCurrentUser);

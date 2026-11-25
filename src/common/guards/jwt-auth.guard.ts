import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthenticatedRequest } from '../http/authenticated-request';

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

const BEARER = /^Bearer\s+(\S+)$/i;

function isAccessPayload(payload: unknown): payload is AccessTokenPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const { sub, sid } = payload as Record<string, unknown>;
  return typeof sub === 'string' && sub.length > 0 && typeof sid === 'string' && sid.length > 0;
}

/**
 * Global guard: every route needs a valid access token unless marked `@Public()` (§VII).
 * Verification is stateless, with no DB lookup (research R1). Distinct codes tell the app
 * whether to refresh or to sign in again (research R2).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * @throws AppException AUTH_TOKEN_MISSING when there is no bearer token.
   * @throws AppException AUTH_TOKEN_EXPIRED when the access token has expired.
   * @throws AppException AUTH_TOKEN_INVALID for a malformed token, a bad signature or a wrong payload.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new AppException(ErrorCode.AUTH_TOKEN_MISSING);

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.jwt.accessSecret,
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new AppException(ErrorCode.AUTH_TOKEN_EXPIRED);
      throw new AppException(ErrorCode.AUTH_TOKEN_INVALID);
    }
    if (!isAccessPayload(payload)) throw new AppException(ErrorCode.AUTH_TOKEN_INVALID);

    request.user = { userId: payload.sub, sessionId: payload.sid };
    return true;
  }
}

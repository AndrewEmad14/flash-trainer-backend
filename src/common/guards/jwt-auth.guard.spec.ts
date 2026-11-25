import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthenticatedRequest } from '../http/authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'x'.repeat(40);
const config = { jwt: { accessSecret: SECRET, accessTtlSeconds: 900 } } as AppConfigService;
const jwt = new JwtService();

const contextFor = (request: Partial<AuthenticatedRequest>): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const bearer = (token: string): Partial<AuthenticatedRequest> => ({
  headers: { authorization: `Bearer ${token}` },
});

const expectCode = async (promise: Promise<unknown>, code: ErrorCode): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector, jwt, config);
  });

  it('should allow @Public routes without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('should attach userId and sessionId for a valid token', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', sid: 'session-1' }, { secret: SECRET });
    const request = bearer(token);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', sessionId: 'session-1' });
  });

  it('should throw AUTH_TOKEN_MISSING when the header is absent or not Bearer', async () => {
    await expectCode(guard.canActivate(contextFor({ headers: {} })), ErrorCode.AUTH_TOKEN_MISSING);
    await expectCode(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic abc' } })),
      ErrorCode.AUTH_TOKEN_MISSING,
    );
  });

  it('should throw AUTH_TOKEN_EXPIRED for an expired token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u', sid: 's', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: SECRET },
    );

    await expectCode(guard.canActivate(contextFor(bearer(token))), ErrorCode.AUTH_TOKEN_EXPIRED);
  });

  it('should throw AUTH_TOKEN_INVALID for a bad signature or garbage', async () => {
    const forged = await jwt.signAsync({ sub: 'u', sid: 's' }, { secret: 'y'.repeat(40) });

    await expectCode(guard.canActivate(contextFor(bearer(forged))), ErrorCode.AUTH_TOKEN_INVALID);
    await expectCode(
      guard.canActivate(contextFor(bearer('not-a-jwt'))),
      ErrorCode.AUTH_TOKEN_INVALID,
    );
  });

  it('should throw AUTH_TOKEN_INVALID when sub or sid is missing', async () => {
    const token = await jwt.signAsync({ sub: 'u' }, { secret: SECRET });

    await expectCode(guard.canActivate(contextFor(bearer(token))), ErrorCode.AUTH_TOKEN_INVALID);
  });
});

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { resolveCurrentUser } from './current-user.decorator';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { SKIP_ENVELOPE_KEY, SkipEnvelope } from './skip-envelope.decorator';

class Sample {
  @Public()
  open(): void {
    /* no-op */
  }

  @SkipEnvelope()
  page(): void {
    /* no-op */
  }
}

const handlerOf = (name: 'open' | 'page'): (() => void) => Sample.prototype[name];

const contextWithUser = (user?: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('decorators', () => {
  const reflector = new Reflector();

  it('should mark a route as public', () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handlerOf('open'))).toBe(true);
  });

  it('should mark a route as skipping the envelope', () => {
    expect(reflector.get<boolean>(SKIP_ENVELOPE_KEY, handlerOf('page'))).toBe(true);
  });

  it('should resolve the authenticated user', () => {
    const user = { userId: 'u1', sessionId: 's1' };

    expect(resolveCurrentUser(undefined, contextWithUser(user))).toEqual(user);
  });

  it('should throw AUTH_TOKEN_MISSING when no user is attached', () => {
    let thrown: unknown;
    try {
      resolveCurrentUser(undefined, contextWithUser());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppException);
    expect(thrown).toMatchObject({ code: ErrorCode.AUTH_TOKEN_MISSING });
  });
});

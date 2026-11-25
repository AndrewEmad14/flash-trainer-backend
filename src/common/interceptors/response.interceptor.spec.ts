import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { PaginatedResult } from '../http/paginated-result';
import { ResponseInterceptor } from './response.interceptor';

const context = (type = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-9' }) }),
  }) as unknown as ExecutionContext;

const handler = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('ResponseInterceptor', () => {
  const reflector = new Reflector();

  it('should wrap data in the success envelope', async () => {
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(interceptor.intercept(context(), handler({ id: 'x' })));

    expect(result).toEqual({
      success: true,
      data: { id: 'x' },
      meta: { requestId: 'req-9', timestamp: expect.any(String) },
    });
  });

  it('should turn undefined into data: null', async () => {
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(interceptor.intercept(context(), handler(undefined)));

    expect(result).toMatchObject({ success: true, data: null });
  });

  it('should move pagination into meta for paginated results', async () => {
    const interceptor = new ResponseInterceptor(reflector);
    const pagination = { page: 2, limit: 1, totalItems: 3, totalPages: 3 };

    const result = await firstValueFrom(
      interceptor.intercept(context(), handler(new PaginatedResult(['b'], pagination))),
    );

    expect(result).toEqual({
      success: true,
      data: ['b'],
      meta: { requestId: 'req-9', timestamp: expect.any(String), pagination },
    });
  });

  it('should not wrap handlers marked with @SkipEnvelope', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(interceptor.intercept(context(), handler('<html/>')));

    expect(result).toBe('<html/>');
  });

  it('should not wrap non-http contexts', async () => {
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(interceptor.intercept(context('rpc'), handler(1)));

    expect(result).toBe(1);
  });
});

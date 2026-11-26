import { AppException } from '../errors/app.exception';
import { DetailCode, ErrorCode } from '../errors/error-codes';
import { uuidParam } from './uuid-param.pipe';

describe('uuidParam', () => {
  const pipe = uuidParam('sessionId');
  const meta = { type: 'param' as const, data: 'sessionId' };

  it('should pass a valid UUID through', async () => {
    const id = '6f1c2b1e-8a4d-4c3e-9f1a-2b3c4d5e6f70';

    await expect(pipe.transform(id, meta)).resolves.toBe(id);
  });

  it('should reject anything else with a field-level VALIDATION_FAILED', async () => {
    const error = await pipe.transform('not-a-uuid', meta).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect((error as AppException).details).toEqual([
      { field: 'sessionId', code: DetailCode.FIELD_INVALID_FORMAT, message: expect.any(String) },
    ]);
  });
});

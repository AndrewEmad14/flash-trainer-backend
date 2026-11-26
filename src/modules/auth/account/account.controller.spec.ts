import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import type { AuthService } from '../auth.service';
import { AccountController } from './account.controller';

describe('AccountController', () => {
  const auth = { deleteAccount: jest.fn() };
  const controller = new AccountController(auth as unknown as AuthService);

  it('should delete the signed-in account and return null with 200', async () => {
    auth.deleteAccount.mockResolvedValue(undefined);

    await expect(
      controller.deleteMe({ userId: 'u1', sessionId: 's1' }, { password: 's3cretPass' }),
    ).resolves.toBeNull();
    expect(auth.deleteAccount).toHaveBeenCalledWith('u1', 's3cretPass');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, AccountController.prototype.deleteMe)).toBe(
      HttpStatus.OK,
    );
  });

  it('should be protected', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AccountController.prototype.deleteMe),
    ).toBeUndefined();
  });
});

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PasswordResetController } from './password-reset.controller';
import type { PasswordResetService } from './password-reset.service';

describe('PasswordResetController', () => {
  const resets = { request: jest.fn(), confirm: jest.fn() };
  const controller = new PasswordResetController(resets as unknown as PasswordResetService);

  it('should start a reset and always return null', () => {
    expect(controller.requestReset({ email: 'a@b.co' })).toBeNull();
    expect(resets.request).toHaveBeenCalledWith('a@b.co');
  });

  it('should confirm a reset and return null', async () => {
    resets.confirm.mockResolvedValue(undefined);

    await expect(
      controller.confirmReset({ token: 't', newPassword: 'n3wSecretPass' }),
    ).resolves.toBeNull();
    expect(resets.confirm).toHaveBeenCalledWith('t', 'n3wSecretPass');
  });

  it('should be public', () => {
    for (const handler of [
      PasswordResetController.prototype.requestReset,
      PasswordResetController.prototype.confirmReset,
    ]) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    }
  });
});

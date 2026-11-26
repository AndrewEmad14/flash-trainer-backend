import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { EmailVerificationController } from './email-verification.controller';
import type { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationController', () => {
  const verification = { resend: jest.fn(), confirm: jest.fn() };
  const controller = new EmailVerificationController(
    verification as unknown as EmailVerificationService,
  );

  it('should resend for the signed-in user and be protected', async () => {
    verification.resend.mockResolvedValue(undefined);

    await expect(controller.resend({ userId: 'u1', sessionId: 's1' })).resolves.toBeNull();
    expect(verification.resend).toHaveBeenCalledWith('u1');
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, EmailVerificationController.prototype.resend),
    ).toBeUndefined();
  });

  it('should confirm the token publicly', async () => {
    const result = { isEmailVerified: true, alreadyVerified: false };
    verification.confirm.mockResolvedValue(result);

    await expect(controller.confirm({ token: 't' })).resolves.toBe(result);
    expect(verification.confirm).toHaveBeenCalledWith('t');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, EmailVerificationController.prototype.confirm)).toBe(
      true,
    );
  });
});

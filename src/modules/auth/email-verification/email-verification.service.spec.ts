import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service';
import type { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import type { TokenService } from '../tokens/token.service';
import { EmailVerificationService } from './email-verification.service';

const user = { id: 'u1', email: 'ahmed@mail.com', fullName: 'Ahmed Ali' };

describe('EmailVerificationService', () => {
  const tokens = { signEmailVerificationToken: jest.fn() };
  const mail = { send: jest.fn() };
  const dispatches = { record: jest.fn() };
  const config = { links: { baseUrl: 'http://10.0.2.2:3000/api/v1/links' } } as AppConfigService;
  const service = new EmailVerificationService(
    tokens as unknown as TokenService,
    mail,
    dispatches as unknown as EmailDispatchService,
    config,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    tokens.signEmailVerificationToken.mockResolvedValue('tok+en/=');
    mail.send.mockResolvedValue(undefined);
    dispatches.record.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('sendVerificationEmail', () => {
    it('should email a URL-encoded verification link and record the dispatch', async () => {
      await service.sendVerificationEmail(user);

      expect(tokens.signEmailVerificationToken).toHaveBeenCalledWith(user);
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ahmed@mail.com',
          text: expect.stringContaining(
            'http://10.0.2.2:3000/api/v1/links/verify-email?token=tok%2Ben%2F%3D',
          ),
        }),
      );
      expect(dispatches.record).toHaveBeenCalledWith('u1', 'VERIFY_EMAIL');
    });

    it('should log and swallow delivery failures without recording a dispatch', async () => {
      const logged: string[] = [];
      jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
      mail.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.sendVerificationEmail(user)).resolves.toBeUndefined();

      expect(dispatches.record).not.toHaveBeenCalled();
      expect(logged.join()).toContain('u1');
      expect(logged.join()).not.toContain('tok+en');
    });

    it('should also handle non-Error failures', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mail.send.mockRejectedValue('boom');

      await expect(service.sendVerificationEmail(user)).resolves.toBeUndefined();
    });
  });
});

import type { AppConfigService } from '../../config/app-config.service';
import { MailDriver, NodeEnv } from '../../config/env.validation';
import { ConsoleMailAdapter } from './console-mail.adapter';
import { createMailService } from './mail.factory';
import { SmtpMailAdapter } from './smtp-mail.adapter';

const config = (driver: MailDriver, nodeEnv = NodeEnv.Test): AppConfigService =>
  ({
    nodeEnv,
    mail: {
      driver,
      from: 'x <x@y.z>',
      smtp:
        driver === MailDriver.Smtp
          ? { host: 'h', port: 465, secure: true, user: 'u', pass: 'p' }
          : null,
    },
  }) as AppConfigService;

describe('createMailService', () => {
  it('should use the console adapter for MAIL_DRIVER=console', () => {
    expect(createMailService(config(MailDriver.Console))).toBeInstanceOf(ConsoleMailAdapter);
  });

  it('should use the SMTP adapter for MAIL_DRIVER=smtp', () => {
    expect(createMailService(config(MailDriver.Smtp))).toBeInstanceOf(SmtpMailAdapter);
  });
});

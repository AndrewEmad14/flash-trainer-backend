import type { AppConfigService } from '../../config/app-config.service';
import { MailDriver, NodeEnv } from '../../config/env.validation';
import { ConsoleMailAdapter } from './console-mail.adapter';
import type { MailService } from './mail.service';
import { SmtpMailAdapter } from './smtp-mail.adapter';

/**
 * Picks the mail adapter for `MAIL_DRIVER` (research R12).
 *
 * @param config - Validated app config.
 * @returns The adapter to inject as {@link MailService}.
 */
export function createMailService(config: AppConfigService): MailService {
  const { driver, smtp, from } = config.mail;
  if (driver === MailDriver.Smtp && smtp) {
    return new SmtpMailAdapter(smtp, from);
  }
  return new ConsoleMailAdapter(config.nodeEnv === NodeEnv.Development);
}

import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConsoleMailAdapter } from '../../src/modules/mail/console-mail.adapter';
import { MailService, type MailMessage } from '../../src/modules/mail/mail.service';

/** The in-memory console mailer used by e2e tests. */
export function mailbox(app: NestExpressApplication): ConsoleMailAdapter {
  const mail = app.get(MailService);
  if (!(mail instanceof ConsoleMailAdapter)) {
    throw new Error('e2e tests require MAIL_DRIVER=console');
  }
  return mail;
}

/** The most recent email sent to `email`, if any. */
export function lastMailTo(app: NestExpressApplication, email: string): MailMessage | undefined {
  return mailbox(app)
    .getSentMessages()
    .filter((message) => message.to === email)
    .at(-1);
}

/** Pulls the `token` query parameter out of the first link in an email. */
export function extractTokenFromLink(message: MailMessage): string {
  const match = /[?&]token=([^&\s"'<>]+)/.exec(message.text);
  if (!match?.[1]) throw new Error(`No token link found in email "${message.subject}"`);
  return decodeURIComponent(match[1]);
}

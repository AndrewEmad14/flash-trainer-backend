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

/**
 * Waits for an email to `email` (for flows that send in the background, e.g. password reset).
 *
 * @throws Error if none arrives within `timeoutMs`.
 */
export async function waitForMailTo(
  app: NestExpressApplication,
  email: string,
  timeoutMs = 2000,
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mail = lastMailTo(app, email);
    if (mail) return mail;
    if (Date.now() > deadline)
      throw new Error(`No email to ${email} within ${String(timeoutMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Gives background work a moment to finish, for "no email was sent" assertions. */
export function settle(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

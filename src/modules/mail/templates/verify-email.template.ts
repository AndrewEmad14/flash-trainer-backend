import type { MailMessage } from '../mail.service';
import { escapeHtml } from './escape-html';

/**
 * Email asking the user to confirm their address (US7, FR-007, FR-019).
 *
 * @param link - Full verification link (`${APP_LINK_BASE_URL}/verify-email?token=…`).
 * @param fullName - Recipient's display name.
 * @returns Subject plus plain-text and HTML bodies.
 */
export function verifyEmailTemplate(link: string, fullName: string): Omit<MailMessage, 'to'> {
  const name = escapeHtml(fullName);
  const href = escapeHtml(link);
  return {
    subject: 'Verify your email for Flash Trainer',
    text: [
      `Hi ${fullName},`,
      '',
      'Please confirm your email address by opening this link:',
      link,
      '',
      'The link expires in 24 hours.',
      "If you didn't create a Flash Trainer account, you can ignore this email.",
    ].join('\n'),
    html: `<p>Hi ${name},</p>
<p>Please confirm your email address:</p>
<p><a href="${href}">Verify my email</a></p>
<p>The link expires in 24 hours.</p>
<p>If you didn't create a Flash Trainer account, you can ignore this email.</p>`,
  };
}

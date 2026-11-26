import type { MailMessage } from '../mail.service';
import { escapeHtml } from './escape-html';

/**
 * Email with a single-use password-reset link (US8, FR-023, FR-024).
 *
 * @param link - Full reset link (`${APP_LINK_BASE_URL}/reset-password?token=…`).
 * @param fullName - Recipient's display name.
 * @returns Subject plus plain-text and HTML bodies.
 */
export function resetPasswordTemplate(link: string, fullName: string): Omit<MailMessage, 'to'> {
  const name = escapeHtml(fullName);
  const href = escapeHtml(link);
  return {
    subject: 'Reset your Flash Trainer password',
    text: [
      `Hi ${fullName},`,
      '',
      'Someone asked to reset the password for your Flash Trainer account.',
      'To choose a new password, open this link:',
      link,
      '',
      'The link expires in 1 hour and works only once. Resetting signs you out on every device.',
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
    ].join('\n'),
    html: `<p>Hi ${name},</p>
<p>Someone asked to reset the password for your Flash Trainer account.</p>
<p><a href="${href}">Choose a new password</a></p>
<p>The link expires in 1 hour and works only once. Resetting signs you out on every device.</p>
<p>If you didn't ask for this, you can ignore this email. Your password won't change.</p>`,
  };
}

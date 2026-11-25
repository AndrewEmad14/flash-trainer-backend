import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { SmtpSettings } from '../../config/app-config.service';
import { MailMessage, MailService } from './mail.service';

/**
 * Sends real email over SMTP with nodemailer. Works with Gmail (App Password), Resend,
 * SendGrid, SES and others, so changing provider only means changing `.env` (research R12).
 */
@Injectable()
export class SmtpMailAdapter extends MailService {
  private readonly transporter: Transporter;

  constructor(
    smtp: SmtpSettings,
    private readonly from: string,
  ) {
    super();
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  /**
   * @throws Error when the SMTP server rejects the message or is unreachable.
   */
  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

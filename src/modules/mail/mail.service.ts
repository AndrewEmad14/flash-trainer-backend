/** An email ready to send. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Port for sending email (research R12). The adapter is chosen by `MAIL_DRIVER`:
 * `console` for dev/tests, `smtp` for real delivery (e.g. Gmail with an App Password).
 */
export abstract class MailService {
  /**
   * Sends one email.
   *
   * @param message - Recipient, subject and bodies.
   * @throws Error when the transport fails. Callers log it and don't fail the request (R12).
   */
  abstract send(message: MailMessage): Promise<void>;
}

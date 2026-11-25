import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailService } from './mail.service';

/**
 * Dev/test mail adapter: keeps every message in memory (e2e tests read the links from it).
 * In development only, it also logs the full text so you can copy links locally. In other
 * environments it logs just the recipient and subject, so tokens never reach the logs.
 */
@Injectable()
export class ConsoleMailAdapter extends MailService {
  private readonly logger = new Logger(ConsoleMailAdapter.name);
  private readonly sent: MailMessage[] = [];

  constructor(private readonly logBodies: boolean) {
    super();
  }

  /** Records the message and logs it. Never fails. */
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    const summary = `Email to ${message.to}: "${message.subject}"`;
    this.logger.log(this.logBodies ? `${summary}\n${message.text}` : summary);
    return Promise.resolve();
  }

  /** Every message sent since the last {@link clear}, oldest first. */
  getSentMessages(): readonly MailMessage[] {
    return [...this.sent];
  }

  /** Forgets all recorded messages (call between tests). */
  clear(): void {
    this.sent.length = 0;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { DetailCode, ErrorCode } from '../../../common/errors/error-codes';
import { DnsResolver } from './dns-resolver';

/** Injection token: whether the check runs (`EMAIL_DNS_CHECK`). Overridable in tests. */
export const EMAIL_DNS_CHECK_ENABLED = Symbol('EMAIL_DNS_CHECK_ENABLED');

/** DNS answers that definitely mean "this domain can't receive mail". */
const DEFINITELY_MISSING = new Set(['ENOTFOUND', 'ENODATA']);

type Verdict = 'deliverable' | 'undeliverable' | 'unknown';

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';

/** RFC 7505 "null MX" (`MX 0 .`): the domain explicitly accepts no mail. */
const isNullMx = (exchange: string): boolean => exchange === '' || exchange === '.';

/**
 * Rejects registration emails whose domain can't receive mail (FR-004 amendment, research
 * R18), like Laravel's `email:dns`. It catches typos and made-up domains. It does NOT prove
 * the mailbox exists; the verification link does that.
 *
 * Fail-open by design: only a definite DNS answer rejects. Timeouts and resolver errors
 * accept the email, so a network hiccup never blocks sign-up.
 */
@Injectable()
export class EmailDomainService {
  private readonly logger = new Logger(EmailDomainService.name);

  constructor(
    private readonly dns: DnsResolver,
    @Inject(EMAIL_DNS_CHECK_ENABLED) private readonly enabled: boolean,
  ) {}

  /**
   * @param email - A format-validated, lowercased email address.
   * @throws AppException VALIDATION_FAILED with a `FIELD_EMAIL_DOMAIN_INVALID` detail on
   *   `email` when the domain doesn't exist, has only a null MX, or has no MX/A/AAAA records.
   */
  async assertDeliverable(email: string): Promise<void> {
    if (!this.enabled) return;
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if ((await this.check(domain)) === 'undeliverable') {
      throw new AppException(ErrorCode.VALIDATION_FAILED, {
        details: [
          {
            field: 'email',
            code: DetailCode.FIELD_EMAIL_DOMAIN_INVALID,
            message: "This email's domain can't receive mail. Check the part after the @.",
          },
        ],
      });
    }
  }

  private async check(domain: string): Promise<Verdict> {
    try {
      const records = await this.dns.resolveMx(domain);
      if (records.some((record) => !isNullMx(record.exchange))) return 'deliverable';
      if (records.length > 0) return 'undeliverable';
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOTFOUND') return 'undeliverable';
      if (code !== 'ENODATA') return this.failOpen(domain, code);
    }
    // No MX records: RFC 5321 falls back to the domain's own address records.
    for (const lookup of [this.dns.resolve4.bind(this.dns), this.dns.resolve6.bind(this.dns)]) {
      try {
        if ((await lookup(domain)).length > 0) return 'deliverable';
      } catch (error) {
        const code = errorCode(error);
        if (!DEFINITELY_MISSING.has(code)) return this.failOpen(domain, code);
      }
    }
    return 'undeliverable';
  }

  /** Logs the domain only. The full address is personal data and never logged. */
  private failOpen(domain: string, code: string): Verdict {
    this.logger.warn(`Email domain check for "${domain}" failed (${code}); accepting the email`);
    return 'unknown';
  }
}

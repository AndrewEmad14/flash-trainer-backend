import { Injectable } from '@nestjs/common';
import type { MxRecord } from 'node:dns';
import { Resolver } from 'node:dns/promises';

/** Per-query DNS timeout for the email domain check (research R18). */
export const DNS_TIMEOUT_MS = 2000;

/**
 * Thin wrapper over Node's DNS resolver with a short timeout and a single try. It exists so
 * the email domain check can be tested with a fake resolver.
 */
@Injectable()
export class DnsResolver {
  private readonly resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });

  /** Mail exchanger records of `domain`. Rejects with a DNS error code (e.g. `ENOTFOUND`). */
  resolveMx(domain: string): Promise<MxRecord[]> {
    return this.resolver.resolveMx(domain);
  }

  /** IPv4 addresses of `domain`. */
  resolve4(domain: string): Promise<string[]> {
    return this.resolver.resolve4(domain);
  }

  /** IPv6 addresses of `domain`. */
  resolve6(domain: string): Promise<string[]> {
    return this.resolver.resolve6(domain);
  }
}

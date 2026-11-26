import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MxRecord } from 'node:dns';
import { DnsResolver } from '../../src/modules/auth/email-domain/dns-resolver';
import { EMAIL_DNS_CHECK_ENABLED } from '../../src/modules/auth/email-domain/email-domain.service';
import { expectErrorEnvelope } from '../utils/assertions';
import { newUser, register } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

const dnsError = (code: string): Error => Object.assign(new Error(code), { code });

/** Fake DNS keyed by domain, so the test never touches the network. */
const zones: Record<string, { mx?: MxRecord[] | string; a?: string[] | string }> = {
  'gmail.com': { mx: [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }] },
  'gmial.con': { mx: 'ENOTFOUND' },
  'no-mail.example': { mx: [{ exchange: '', priority: 0 }] },
  'a-only.example': { mx: 'ENODATA', a: ['192.0.2.10'] },
  'slow.example': { mx: 'ETIMEOUT' },
};

const lookup = <T>(value: T | string | undefined): Promise<T> => {
  if (value === undefined) return Promise.reject(dnsError('ENODATA'));
  if (typeof value === 'string') return Promise.reject(dnsError(value));
  return Promise.resolve(value);
};

const fakeDns = {
  resolveMx: (domain: string) => lookup(zones[domain]?.mx),
  resolve4: (domain: string) => lookup(zones[domain]?.a),
  resolve6: () => lookup<string[]>(undefined),
};

describe('POST /api/v1/auth/register: email domain check (B1, research R18)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [
        { provide: DnsResolver, useValue: fakeDns },
        { provide: EMAIL_DNS_CHECK_ENABLED, useValue: true },
      ],
    });
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['ahmed@gmial.con', 'ahmed@no-mail.example'])(
    'should reject %s with FIELD_EMAIL_DOMAIN_INVALID on email',
    async (email) => {
      const response = await register(app, newUser({ email }));

      expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
      expect((response.body as { error: { details: unknown } }).error.details).toEqual([
        {
          field: 'email',
          code: 'FIELD_EMAIL_DOMAIN_INVALID',
          message: expect.stringContaining('after the @'),
        },
      ]);
    },
  );

  it.each([
    ['a normal domain with MX records', 'ahmed@gmail.com'],
    ['a domain with only an A record (implicit MX)', 'ahmed@a-only.example'],
    ['a domain whose lookup times out (fail open)', 'ahmed@slow.example'],
  ])('should register with %s', async (_case, email) => {
    const response = await register(app, newUser({ email }));

    expect(response.status).toBe(201);
  });

  it('should report format errors before checking the domain', async () => {
    const response = await register(app, newUser({ email: 'not-an-email' }));

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('FIELD_EMAIL_DOMAIN_INVALID');
  });
});

import { Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { DetailCode, ErrorCode } from '../../../common/errors/error-codes';
import type { DnsResolver } from './dns-resolver';
import { EmailDomainService } from './email-domain.service';

const dnsError = (code: string): Error => Object.assign(new Error(code), { code });

describe('EmailDomainService', () => {
  const dns = { resolveMx: jest.fn(), resolve4: jest.fn(), resolve6: jest.fn() };
  const service = new EmailDomainService(dns as unknown as DnsResolver, true);
  let warnings: string[];

  beforeEach(() => {
    jest.resetAllMocks();
    warnings = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const expectRejected = async (email: string): Promise<void> => {
    const error = await service.assertDeliverable(email).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect((error as AppException).details).toEqual([
      expect.objectContaining({ field: 'email', code: DetailCode.FIELD_EMAIL_DOMAIN_INVALID }),
    ]);
  };

  describe('assertDeliverable', () => {
    it('should accept a domain with MX records, looking up only the domain part', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.gmail.com', priority: 5 }]);

      await expect(service.assertDeliverable('ahmed@Gmail.com')).resolves.toBeUndefined();
      expect(dns.resolveMx).toHaveBeenCalledWith('gmail.com');
      expect(dns.resolve4).not.toHaveBeenCalled();
    });

    it('should reject a domain that does not exist (ENOTFOUND)', async () => {
      dns.resolveMx.mockRejectedValue(dnsError('ENOTFOUND'));

      await expectRejected('ahmed@gmial.con');
    });

    it('should reject a domain that publishes only a null MX (RFC 7505)', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]);

      await expectRejected('ahmed@no-mail.example');
    });

    it('should fall back to A records when there is no MX', async () => {
      dns.resolveMx.mockRejectedValue(dnsError('ENODATA'));
      dns.resolve4.mockResolvedValue(['192.0.2.10']);

      await expect(service.assertDeliverable('a@host.example')).resolves.toBeUndefined();
    });

    it('should fall back to AAAA records when there is no MX and no A record', async () => {
      dns.resolveMx.mockResolvedValue([]);
      dns.resolve4.mockRejectedValue(dnsError('ENODATA'));
      dns.resolve6.mockResolvedValue(['2001:db8::1']);

      await expect(service.assertDeliverable('a@v6.example')).resolves.toBeUndefined();
    });

    it('should reject when MX, A and AAAA all have no data', async () => {
      dns.resolveMx.mockRejectedValue(dnsError('ENODATA'));
      dns.resolve4.mockResolvedValue([]);
      dns.resolve6.mockRejectedValue(dnsError('ENOTFOUND'));

      await expectRejected('a@empty.example');
    });

    it.each(['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED'])(
      'should fail open on %s from the MX lookup and log only the domain',
      async (code) => {
        dns.resolveMx.mockRejectedValue(dnsError(code));

        await expect(service.assertDeliverable('ahmed@slow.example')).resolves.toBeUndefined();
        expect(warnings.join()).toContain('slow.example');
        expect(warnings.join()).toContain(code);
        expect(warnings.join()).not.toContain('ahmed@');
      },
    );

    it('should fail open when the address fallback times out', async () => {
      dns.resolveMx.mockRejectedValue(dnsError('ENODATA'));
      dns.resolve4.mockRejectedValue(dnsError('ETIMEOUT'));

      await expect(service.assertDeliverable('a@x.example')).resolves.toBeUndefined();
    });

    it('should fail open on errors without a DNS code', async () => {
      dns.resolveMx.mockRejectedValue('weird');

      await expect(service.assertDeliverable('a@x.example')).resolves.toBeUndefined();
      expect(warnings.join()).toContain('UNKNOWN');
    });

    it('should do no lookup at all when the check is disabled', async () => {
      const disabled = new EmailDomainService(dns as unknown as DnsResolver, false);

      await expect(disabled.assertDeliverable('a@gmial.con')).resolves.toBeUndefined();
      expect(dns.resolveMx).not.toHaveBeenCalled();
    });
  });
});

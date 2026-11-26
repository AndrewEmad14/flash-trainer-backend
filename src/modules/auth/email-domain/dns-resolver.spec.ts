import { Resolver } from 'node:dns/promises';
import { DnsResolver } from './dns-resolver';

describe('DnsResolver', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should delegate MX, A and AAAA lookups to the Node resolver', async () => {
    const mx = jest
      .spyOn(Resolver.prototype, 'resolveMx')
      .mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
    const a = jest.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['192.0.2.1']);
    const aaaa = jest.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue(['2001:db8::1']);
    const dns = new DnsResolver();

    await expect(dns.resolveMx('example.com')).resolves.toHaveLength(1);
    await expect(dns.resolve4('example.com')).resolves.toEqual(['192.0.2.1']);
    await expect(dns.resolve6('example.com')).resolves.toEqual(['2001:db8::1']);
    expect(mx).toHaveBeenCalledWith('example.com');
    expect(a).toHaveBeenCalledWith('example.com');
    expect(aaaa).toHaveBeenCalledWith('example.com');
  });
});

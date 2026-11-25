import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  it('should produce an argon2id hash with the R11 parameters', async () => {
    const hash = await hasher.hash('s3cretPass');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('s3cretPass');
  });

  it('should verify the correct password and reject a wrong one', async () => {
    const hash = await hasher.hash('s3cretPass');

    await expect(hasher.verify(hash, 's3cretPass')).resolves.toBe(true);
    await expect(hasher.verify(hash, 's3cretPasS')).resolves.toBe(false);
  });

  it('should treat a malformed hash as a mismatch instead of throwing', async () => {
    await expect(hasher.verify('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('should always fail a dummy verification', async () => {
    await expect(hasher.verifyDummy('anything')).resolves.toBe(false);
    await expect(hasher.verifyDummy('dummy-password-for-timing-only-1')).resolves.toBe(false);
  });
});

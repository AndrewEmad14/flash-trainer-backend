import { generateOpaqueToken, sha256Hex } from './hash.util';

describe('sha256Hex', () => {
  it('should return the known SHA-256 hex digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('generateOpaqueToken', () => {
  it('should return a 43-char base64url token for 32 bytes', () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('should return a different token every time', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  it('should honour a custom byte length', () => {
    expect(generateOpaqueToken(16)).toHaveLength(22);
  });
});

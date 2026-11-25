import { normalizeEmail, trimString } from './normalize.util';

describe('trimString', () => {
  it('should trim surrounding whitespace', () => {
    expect(trimString('  Ahmed_A \t')).toBe('Ahmed_A');
  });

  it('should pass non-strings through unchanged', () => {
    expect(trimString(42)).toBe(42);
    expect(trimString(undefined)).toBeUndefined();
  });
});

describe('normalizeEmail', () => {
  it('should trim and lowercase emails', () => {
    expect(normalizeEmail(' Ahmed@Mail.COM ')).toBe('ahmed@mail.com');
  });

  it('should pass non-strings through unchanged', () => {
    expect(normalizeEmail(null)).toBeNull();
  });
});

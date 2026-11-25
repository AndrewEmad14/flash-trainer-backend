import { validate } from 'class-validator';
import { IsStrongPassword, isStrongPassword } from './is-strong-password.validator';

class Sample {
  @IsStrongPassword()
  password: unknown;
}

const errorsFor = async (password: unknown): Promise<string[]> => {
  const sample = new Sample();
  sample.password = password;
  const errors = await validate(sample);
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
};

describe('isStrongPassword', () => {
  it.each(['s3cretPass', 'abcdefg1', ' pass word 1 ', 'كلمةسر123', `a1${'x'.repeat(62)}`])(
    'should accept %p',
    (password) => {
      expect(isStrongPassword(password)).toBe(true);
    },
  );

  it.each([
    ['too short', 'abc123'],
    ['too long', `a1${'x'.repeat(63)}`],
    ['no digit', 'abcdefgh'],
    ['no letter', '12345678'],
    ['not a string', 12345678],
    ['empty', ''],
  ])('should reject a password that is %s', (_reason, password) => {
    expect(isStrongPassword(password)).toBe(false);
  });
});

describe('@IsStrongPassword', () => {
  it('should report the isStrongPassword constraint for weak passwords', async () => {
    expect(await errorsFor('abcdefgh')).toEqual(['isStrongPassword']);
  });

  it('should pass strong passwords', async () => {
    expect(await errorsFor('s3cretPass')).toEqual([]);
  });
});

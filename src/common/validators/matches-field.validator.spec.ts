import { validate } from 'class-validator';
import { MatchesField } from './matches-field.validator';

class Sample {
  password: unknown;

  @MatchesField('password')
  passwordConfirmation: unknown;
}

const failures = async (password: unknown, confirmation: unknown) => {
  const sample = new Sample();
  sample.password = password;
  sample.passwordConfirmation = confirmation;
  const errors = await validate(sample);
  return errors.map((e) => ({ property: e.property, constraints: e.constraints }));
};

describe('@MatchesField', () => {
  it('should pass when both values are identical', async () => {
    expect(await failures('s3cretPass', 's3cretPass')).toEqual([]);
  });

  it.each([
    ['different', 's3cretPass', 's3cretPasS'],
    ['differently spaced', ' pass word 1 ', 'pass word 1'],
    ['not a string', 's3cretPass', 12345678],
    ['missing', 's3cretPass', undefined],
  ])('should fail when the confirmation is %s', async (_case, password, confirmation) => {
    expect(await failures(password, confirmation)).toEqual([
      {
        property: 'passwordConfirmation',
        constraints: { matchesField: 'passwordConfirmation must match password' },
      },
    ]);
  });
});

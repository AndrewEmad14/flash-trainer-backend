import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmPasswordResetDto } from './confirm-password-reset.dto';

const failed = async (input: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(ConfirmPasswordResetDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
};

describe('ConfirmPasswordResetDto', () => {
  const valid = {
    token: 't',
    newPassword: 'n3wSecretPass',
    newPasswordConfirmation: 'n3wSecretPass',
  };

  it('should accept a matching confirmation', async () => {
    expect(await failed(valid)).toEqual([]);
  });

  it.each([
    [
      'a weak new password',
      { newPassword: 'abcdefgh', newPasswordConfirmation: 'abcdefgh' },
      ['newPassword'],
    ],
    [
      'a different confirmation',
      { newPasswordConfirmation: 'n3wSecretPasS' },
      ['newPasswordConfirmation'],
    ],
    ['a missing confirmation', { newPasswordConfirmation: undefined }, ['newPasswordConfirmation']],
    ['a missing token', { token: '' }, ['token']],
  ])('should reject %s', async (_case, override, fields) => {
    expect(await failed({ ...valid, ...override })).toEqual(fields);
  });
});

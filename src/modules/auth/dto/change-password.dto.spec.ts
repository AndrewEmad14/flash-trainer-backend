import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

const failed = async (input: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(ChangePasswordDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
};

describe('ChangePasswordDto', () => {
  const valid = {
    currentPassword: 's3cretPass',
    newPassword: 'n3wSecretPass',
    newPasswordConfirmation: 'n3wSecretPass',
  };

  it('should accept a valid change', async () => {
    expect(await failed(valid)).toEqual([]);
  });

  it('should not apply the password policy to the current password', async () => {
    expect(await failed({ ...valid, currentPassword: 'old' })).toEqual([]);
  });

  it.each([
    [
      'a weak new password',
      { newPassword: 'abcdefgh', newPasswordConfirmation: 'abcdefgh' },
      ['newPassword'],
    ],
    ['a mismatched confirmation', { newPasswordConfirmation: 'x' }, ['newPasswordConfirmation']],
    ['an empty current password', { currentPassword: '' }, ['currentPassword']],
  ])('should reject %s', async (_case, override, fields) => {
    expect(await failed({ ...valid, ...override })).toEqual(fields);
  });
});

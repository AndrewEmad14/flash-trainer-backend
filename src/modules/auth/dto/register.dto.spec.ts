import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const valid = {
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  password: 's3cretPass',
  passwordConfirmation: 's3cretPass',
};

const check = async (input: object): Promise<{ dto: RegisterDto; failed: string[] }> => {
  const dto = plainToInstance(RegisterDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, failed: errors.map((error) => error.property).sort() };
};

describe('RegisterDto', () => {
  it('should accept a valid payload with optional fields', async () => {
    const { failed } = await check({
      ...valid,
      phone: '+201001234567',
      deviceName: 'Pixel 9',
      deviceOs: 'Android 16',
    });

    expect(failed).toEqual([]);
  });

  it('should trim names and lowercase the email', async () => {
    const { dto } = await check({
      ...valid,
      fullName: '  Ahmed Ali ',
      username: ' Ahmed_A ',
      email: ' Ahmed@Mail.COM ',
    });

    expect(dto.fullName).toBe('Ahmed Ali');
    expect(dto.username).toBe('Ahmed_A');
    expect(dto.email).toBe('ahmed@mail.com');
  });

  it('should never trim the password', async () => {
    const { dto } = await check({
      ...valid,
      password: ' pass word 1 ',
      passwordConfirmation: ' pass word 1 ',
    });

    expect(dto.password).toBe(' pass word 1 ');
  });

  it.each([
    ['fullName', { fullName: '   ' }],
    ['fullName', { fullName: 'x'.repeat(101) }],
    ['username', { username: 'ab' }],
    ['username', { username: 'x'.repeat(31) }],
    ['username', { username: 'has space' }],
    ['username', { username: 'ahmed@x' }],
    ['email', { email: 'nope' }],
    ['email', { email: `${'x'.repeat(250)}@a.co` }],
    ['password', { password: 'abcdefgh', passwordConfirmation: 'abcdefgh' }],
    ['passwordConfirmation', { passwordConfirmation: 's3cretPasS' }],
    ['passwordConfirmation', { passwordConfirmation: '' }],
    ['phone', { phone: '01001234567' }],
    ['deviceName', { deviceName: 'x'.repeat(101) }],
    ['deviceOs', { deviceOs: 'x'.repeat(51) }],
  ])('should reject an invalid %s', async (field, override) => {
    const { failed } = await check({ ...valid, ...override });

    expect(failed).toEqual([field]);
  });

  it('should reject unknown properties', async () => {
    const { failed } = await check({ ...valid, role: 'admin' });

    expect(failed).toEqual(['role']);
  });
});

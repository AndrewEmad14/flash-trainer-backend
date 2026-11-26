import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const check = async (input: object): Promise<{ dto: LoginDto; failed: string[] }> => {
  const dto = plainToInstance(LoginDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, failed: errors.map((error) => error.property).sort() };
};

describe('LoginDto', () => {
  it('should accept an identifier and password, trimming the identifier only', async () => {
    const { dto, failed } = await check({ identifier: ' Ahmed_A ', password: ' pw ' });

    expect(failed).toEqual([]);
    expect(dto.identifier).toBe('Ahmed_A');
    expect(dto.password).toBe(' pw ');
  });

  it('should not apply the password policy on sign-in', async () => {
    expect((await check({ identifier: 'a', password: 'x' })).failed).toEqual([]);
  });

  it.each([
    ['identifier', { identifier: '   ', password: 'x' }],
    ['identifier', { identifier: 'x'.repeat(255), password: 'x' }],
    ['password', { identifier: 'a', password: '' }],
    ['password', { identifier: 'a', password: 'x'.repeat(129) }],
    ['deviceName', { identifier: 'a', password: 'x', deviceName: 'x'.repeat(101) }],
    ['deviceOs', { identifier: 'a', password: 'x', deviceOs: 'x'.repeat(51) }],
  ])('should reject an invalid %s', async (field, input) => {
    expect((await check(input)).failed).toEqual([field]);
  });
});

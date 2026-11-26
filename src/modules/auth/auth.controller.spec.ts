import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const auth = { register: jest.fn(), login: jest.fn() };
  const controller = new AuthController(auth as unknown as AuthService);

  describe('register', () => {
    it('should delegate to AuthService.register and return its result', async () => {
      const result = { user: { id: 'u1' }, tokens: {} };
      auth.register.mockResolvedValue(result);
      const dto = {
        fullName: 'A',
        username: 'abc',
        email: 'a@b.co',
        password: 's3cretPass',
      };

      await expect(controller.register(dto)).resolves.toBe(result);
      expect(auth.register).toHaveBeenCalledWith(dto);
    });

    it('should be public and respond with 201', () => {
      const handler = AuthController.prototype.register;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.CREATED);
    });
  });

  describe('login', () => {
    it('should delegate to AuthService.login and respond with 200', async () => {
      const result = { user: { id: 'u1' }, tokens: {} };
      auth.login.mockResolvedValue(result);
      const dto = { identifier: 'ahmed@mail.com', password: 's3cretPass' };

      await expect(controller.login(dto)).resolves.toBe(result);
      expect(auth.login).toHaveBeenCalledWith(dto);
      const handler = AuthController.prototype.login;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
    });
  });
});

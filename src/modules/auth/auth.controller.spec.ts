import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { SessionsService } from './sessions/sessions.service';

describe('AuthController', () => {
  const auth = { register: jest.fn(), login: jest.fn() };
  const sessions = {
    refresh: jest.fn(),
    logoutByRefreshToken: jest.fn(),
    revokeAll: jest.fn(),
  };
  const controller = new AuthController(
    auth as unknown as AuthService,
    sessions as unknown as SessionsService,
  );

  describe('register', () => {
    it('should delegate to AuthService.register and return its result', async () => {
      const result = { user: { id: 'u1' }, tokens: {} };
      auth.register.mockResolvedValue(result);
      const dto = {
        fullName: 'A',
        username: 'abc',
        email: 'a@b.co',
        password: 's3cretPass',
        passwordConfirmation: 's3cretPass',
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

  describe('refresh', () => {
    it('should delegate to SessionsService.refresh, be public and respond with 200', async () => {
      const tokens = { tokenType: 'Bearer', accessToken: 'a' };
      sessions.refresh.mockResolvedValue(tokens);

      await expect(controller.refresh({ refreshToken: 'r' })).resolves.toBe(tokens);
      expect(sessions.refresh).toHaveBeenCalledWith('r');
      const handler = AuthController.prototype.refresh;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
    });
  });

  describe('logout', () => {
    it('should sign out by refresh token, be public and return null with 200', async () => {
      sessions.logoutByRefreshToken.mockResolvedValue(undefined);

      await expect(controller.logout({ refreshToken: 'r' })).resolves.toBeNull();
      expect(sessions.logoutByRefreshToken).toHaveBeenCalledWith('r');
      const handler = AuthController.prototype.logout;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
    });
  });

  describe('logoutAll', () => {
    it('should revoke every session of the signed-in user and be protected', async () => {
      sessions.revokeAll.mockResolvedValue(2);

      await expect(controller.logoutAll({ userId: 'u1', sessionId: 's1' })).resolves.toBeNull();
      expect(sessions.revokeAll).toHaveBeenCalledWith('u1');
      const handler = AuthController.prototype.logoutAll;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
    });
  });
});

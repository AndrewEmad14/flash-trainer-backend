import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

describe('UsersController', () => {
  const users = { getMe: jest.fn() };
  const controller = new UsersController(users as unknown as UsersService);

  describe('getMe', () => {
    it("should return the signed-in user's account", async () => {
      const account = { id: 'u1' };
      users.getMe.mockResolvedValue(account);

      await expect(controller.getMe({ userId: 'u1', sessionId: 's1' })).resolves.toBe(account);
      expect(users.getMe).toHaveBeenCalledWith('u1');
    });

    it('should be protected (not marked public)', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype.getMe)).toBeUndefined();
    });
  });
});

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { SessionsController } from './sessions.controller';
import type { SessionsService } from './sessions.service';

describe('SessionsController', () => {
  const sessions = {
    listForUser: jest.fn(),
    revokeOwnSession: jest.fn(),
    updatePushToken: jest.fn(),
  };
  const controller = new SessionsController(sessions as unknown as SessionsService);
  const user = { userId: 'u1', sessionId: 's1' };

  it('should list the devices of the signed-in user, marking the current one', async () => {
    sessions.listForUser.mockResolvedValue([{ id: 's1', isCurrent: true }]);

    await expect(controller.list(user)).resolves.toEqual([{ id: 's1', isCurrent: true }]);
    expect(sessions.listForUser).toHaveBeenCalledWith('u1', 's1');
  });

  it('should revoke one of my sessions and return null with 200', async () => {
    sessions.revokeOwnSession.mockResolvedValue(undefined);

    await expect(controller.revoke(user, 's2')).resolves.toBeNull();
    expect(sessions.revokeOwnSession).toHaveBeenCalledWith('u1', 's2');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SessionsController.prototype.revoke)).toBe(
      HttpStatus.OK,
    );
  });

  it("should save the push token on the requesting device's session", async () => {
    sessions.updatePushToken.mockResolvedValue(undefined);

    await expect(controller.updatePushToken(user, { pushToken: 'fcm' })).resolves.toBeNull();
    expect(sessions.updatePushToken).toHaveBeenCalledWith('s1', 'fcm');
  });

  it('should be protected', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SessionsController.prototype.list)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SessionsController.prototype.revoke)).toBeUndefined();
  });
});

import { Logger } from '@nestjs/common';
import type { EmailDispatchRepository } from '../email-dispatch/email-dispatch.repository';
import type { LoginAttemptsRepository } from '../login-throttle/login-attempts.repository';
import type { PasswordResetsRepository } from '../password-reset/password-resets.repository';
import type { SessionsRepository } from '../sessions/sessions.repository';
import { AuthCleanupTask } from './auth-cleanup.task';

const NOW = new Date('2026-11-26T03:00:00.000Z');
const DAY = 24 * 60 * 60_000;

describe('AuthCleanupTask', () => {
  const sessions = { deleteStale: jest.fn() };
  const resets = { deleteCreatedBefore: jest.fn() };
  const dispatches = { deleteCreatedBefore: jest.fn() };
  const loginAttempts = { deleteStale: jest.fn() };
  const task = new AuthCleanupTask(
    sessions as unknown as SessionsRepository,
    resets as unknown as PasswordResetsRepository,
    dispatches as unknown as EmailDispatchRepository,
    loginAttempts as unknown as LoginAttemptsRepository,
  );
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    jest.resetAllMocks();
    logs = [];
    errors = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      errors.push(String(m));
    });
    sessions.deleteStale.mockResolvedValue(3);
    resets.deleteCreatedBefore.mockResolvedValue(2);
    dispatches.deleteCreatedBefore.mockResolvedValue(5);
    loginAttempts.deleteStale.mockResolvedValue(1);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should delete each table with its retention cutoff and log the counts', async () => {
    const counts = await task.run(NOW);

    expect(sessions.deleteStale).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY));
    expect(resets.deleteCreatedBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - DAY));
    expect(dispatches.deleteCreatedBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - DAY));
    expect(loginAttempts.deleteStale).toHaveBeenCalledWith(
      new Date(NOW.getTime() - 15 * 60_000),
      NOW,
    );
    expect(counts).toEqual({
      sessions: 3,
      passwordResets: 2,
      emailDispatches: 5,
      loginAttempts: 1,
    });
    expect(logs.join()).toContain('Cleanup removed 3 sessions, 2 password resets');
  });

  it('should keep cleaning the other tables when one fails', async () => {
    resets.deleteCreatedBefore.mockRejectedValue(new Error('lock timeout'));

    const counts = await task.run(NOW);

    expect(counts).toEqual({
      sessions: 3,
      passwordResets: 'failed',
      emailDispatches: 5,
      loginAttempts: 1,
    });
    expect(errors.join()).toContain('Cleanup of password resets failed');
  });

  it('should handle non-Error failures', async () => {
    sessions.deleteStale.mockRejectedValue('boom');

    await expect(task.run(NOW)).resolves.toMatchObject({ sessions: 'failed' });
  });

  it('should run a pass at the current time from the cron handler', async () => {
    jest.useFakeTimers({ now: NOW });

    await task.handleCron();

    expect(sessions.deleteStale).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY));
    jest.useRealTimers();
  });
});

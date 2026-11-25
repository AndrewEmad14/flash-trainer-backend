import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = {} as PrismaService;

  it('should ping the database through terminus', async () => {
    const pingCheck = jest.fn().mockResolvedValue({ database: { status: 'up' } });
    const check = jest.fn(async (indicators: (() => Promise<unknown>)[]) => {
      for (const indicator of indicators) await indicator();
      return { status: 'ok', info: { database: { status: 'up' } } };
    });
    const controller = new HealthController(
      { check } as unknown as HealthCheckService,
      { pingCheck } as unknown as PrismaHealthIndicator,
      prisma,
    );

    await expect(controller.check()).resolves.toMatchObject({ status: 'ok' });
    expect(pingCheck).toHaveBeenCalledWith('database', prisma);
  });

  it('should propagate the 503 that terminus throws when the database is down', async () => {
    const check = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException({ database: { status: 'down' } }));
    const controller = new HealthController(
      { check } as unknown as HealthCheckService,
      { pingCheck: jest.fn() } as unknown as PrismaHealthIndicator,
      prisma,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

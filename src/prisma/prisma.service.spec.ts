import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const config = { databaseUrl: 'postgresql://u:p@localhost:5432/db' } as AppConfigService;

  it('should connect when the module initialises', async () => {
    const prisma = new PrismaService(config);
    const connect = jest.spyOn(prisma, '$connect').mockResolvedValue(undefined);

    await prisma.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('should disconnect when the module is destroyed', async () => {
    const prisma = new PrismaService(config);
    const disconnect = jest.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);

    await prisma.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

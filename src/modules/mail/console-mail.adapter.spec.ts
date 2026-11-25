import { Logger } from '@nestjs/common';
import { ConsoleMailAdapter } from './console-mail.adapter';

const message = {
  to: 'ahmed@mail.com',
  subject: 'Verify your email',
  text: 'Open http://x/verify-email?token=SECRET',
  html: '<a href="http://x/verify-email?token=SECRET">Verify</a>',
};

describe('ConsoleMailAdapter', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((value: unknown) => {
      logged.push(String(value));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('should record sent messages until cleared', async () => {
    const adapter = new ConsoleMailAdapter(false);

    await adapter.send(message);

    expect(adapter.getSentMessages()).toEqual([message]);
    adapter.clear();
    expect(adapter.getSentMessages()).toEqual([]);
  });

  it('should log only the recipient and subject when bodies are disabled', async () => {
    await new ConsoleMailAdapter(false).send(message);

    expect(logged.join()).toContain('ahmed@mail.com');
    expect(logged.join()).not.toContain('SECRET');
  });

  it('should log the full text when bodies are enabled (development)', async () => {
    await new ConsoleMailAdapter(true).send(message);

    expect(logged.join()).toContain('token=SECRET');
  });
});

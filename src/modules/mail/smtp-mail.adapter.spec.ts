import { createTransport } from 'nodemailer';
import { SmtpMailAdapter } from './smtp-mail.adapter';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const smtp = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'pw' };
const message = { to: 'a@b.c', subject: 'S', text: 'T', html: '<p>T</p>' };

describe('SmtpMailAdapter', () => {
  const sendMail = jest.fn();

  beforeEach(() => {
    sendMail.mockReset();
    jest.mocked(createTransport).mockReturnValue({ sendMail } as never);
  });

  it('should create the transport from SMTP settings', () => {
    new SmtpMailAdapter(smtp, 'Me <me@gmail.com>');

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'me@gmail.com', pass: 'pw' },
    });
  });

  it('should send the message from the configured sender', async () => {
    sendMail.mockResolvedValue({});

    await new SmtpMailAdapter(smtp, 'Me <me@gmail.com>').send(message);

    expect(sendMail).toHaveBeenCalledWith({ from: 'Me <me@gmail.com>', ...message });
  });

  it('should propagate transport failures', async () => {
    sendMail.mockRejectedValue(new Error('auth failed'));

    await expect(new SmtpMailAdapter(smtp, 'x').send(message)).rejects.toThrow('auth failed');
  });
});

import { resetPasswordTemplate } from './reset-password.template';

const LINK = 'http://10.0.2.2:3000/api/v1/links/reset-password?token=abc';

describe('resetPasswordTemplate', () => {
  it('should include the link, the 1-hour expiry and the sign-out warning', () => {
    const mail = resetPasswordTemplate(LINK, 'Ahmed Ali');

    expect(mail.subject).toBe('Reset your Flash Trainer password');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('1 hour');
    expect(mail.text).toContain('every device');
    expect(mail.html).toContain(`href="${LINK}"`);
  });

  it('should HTML-escape the name', () => {
    expect(resetPasswordTemplate(LINK, '<b>x</b>').html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

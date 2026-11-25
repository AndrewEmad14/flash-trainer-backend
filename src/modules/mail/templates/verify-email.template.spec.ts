import { verifyEmailTemplate } from './verify-email.template';

const LINK = 'http://10.0.2.2:3000/api/v1/links/verify-email?token=abc.def';

describe('verifyEmailTemplate', () => {
  it('should include the link and the 24-hour expiry in both bodies', () => {
    const mail = verifyEmailTemplate(LINK, 'Ahmed Ali');

    expect(mail.subject).toBe('Verify your email for Flash Trainer');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('24 hours');
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain('Hi Ahmed Ali,');
  });

  it('should HTML-escape the name to prevent injection', () => {
    const mail = verifyEmailTemplate(LINK, '<script>alert(1)</script>');

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

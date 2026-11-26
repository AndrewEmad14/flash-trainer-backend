# Mail module

Sends the auth emails (verification, password reset) through a small `MailService` port.

## Drivers (`MAIL_DRIVER`)

| Driver    | Use           | Behaviour                                                                                                                                                                          |
| --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `console` | dev, tests    | Keeps messages in memory (e2e tests read links from it). Logs the **full** email only when `NODE_ENV=development`; otherwise just recipient + subject, so tokens never reach logs. |
| `smtp`    | real delivery | nodemailer with `SMTP_*` settings. Works with Gmail (App Password), Resend, SendGrid, SES… Switching provider = changing `.env`.                                                   |

## Templates

`templates/` holds plain functions returning `{ subject, text, html }`. All user-supplied
values and links go through `escapeHtml()` before entering HTML.

## Rules that aren't obvious

- Callers treat delivery failures as non-fatal: they're logged (never with the token) and
  the request still succeeds; the user can ask for a new email.
- The dispatch is recorded only after a successful send, so rate limits count real emails.

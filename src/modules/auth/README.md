# Auth module

Sign-up, sign-in, sessions, email verification, password reset/change and account deletion
for the mobile app. Spec: `specs/001-user-auth/` (US1–US11).

## Endpoints (all under `/api/v1`)

| Endpoint                                           | Auth             | Purpose                                                      |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `POST /auth/register`                              | public           | Create account, sign this device in, send verification email |
| `POST /auth/login`                                 | public           | Sign in with email **or** username                           |
| `POST /auth/refresh`                               | public           | Rotate tokens, slide the session's 30-day expiry             |
| `POST /auth/logout`                                | public           | Sign out the device that owns the refresh token              |
| `POST /auth/logout-all`                            | bearer           | Sign out every device                                        |
| `GET /auth/sessions` · `DELETE /auth/sessions/:id` | bearer           | List devices / sign one out                                  |
| `PUT /auth/sessions/current/push-token`            | bearer           | Save this device's FCM token                                 |
| `POST /auth/email-verification` · `…/confirm`      | bearer · public  | Resend / confirm email                                       |
| `POST /auth/password-reset` · `…/confirm`          | public           | Forgot password                                              |
| `PUT /auth/password`                               | bearer           | Change password                                              |
| `DELETE /users/me`                                 | bearer           | Delete account (`account/account.controller.ts`)             |
| `GET /links/:type`                                 | public, **HTML** | Email-link landing page that opens the app                   |

## Folder map

| Folder                | Responsibility                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| `tokens/`             | Access JWT (15 min), opaque refresh tokens, email-verification JWT          |
| `sessions/`           | One row per signed-in device; rotation, revocation, device list, push token |
| `passwords/`          | argon2id hashing (+ dummy verify for timing safety)                         |
| `login-throttle/`     | 5 failures / 15 min → 15-min lock, per account **or** unknown identifier    |
| `email-dispatch/`     | Log of sent auth emails, used for "1/min, 5/day" limits                     |
| `email-verification/` | Send / resend / confirm verification links                                  |
| `password-reset/`     | Single-use 1-hour reset links                                               |
| `email-domain/`       | Rejects emails whose domain can't receive mail (DNS MX check)               |
| `links/`              | HTML landing page for email links (constitution §III.1 non-API exemption)   |
| `account/`            | `DELETE /users/me` (here, not in `users/`, to avoid a module cycle)         |
| `cleanup/`            | Daily 03:00 job deleting dead sessions, links, logs and counters            |

## Rules that aren't obvious

- **Never reveal whether an account exists.** Login returns the same error (and similar
  timing, via a dummy hash) for unknown accounts. Unknown identifiers lock out like real
  ones. Password-reset requests always return 200 and do their work in the background.
- **Refresh tokens work once.** Rotation is a compare-and-swap. Two parallel refreshes with
  the same token: one wins, the other gets `AUTH_SESSION_INVALID`. The app must serialise
  refreshes.
- **Access tokens are stateless.** After any sign-out they keep working until they expire
  (≤15 min). Refresh tokens stop immediately.
- **Fail-safe order when a password changes:** claim link (reset only) → revoke sessions →
  store new hash. A crash part-way can only sign people out, never leave a new password with
  old sessions alive.
- **Wrong current password = 403, not 401**, so the app doesn't treat a typo as a dead session.
- **Rate limits:** `@AuthThrottle()` (10/min per IP) on credential and email endpoints,
  100/min globally.
- Only token **hashes** are stored (SHA-256 for refresh/reset tokens, argon2id for passwords).

# Flash Trainer: Backend

REST API for the Flash Trainer Flutter app. **NestJS 12** · **PostgreSQL 16** · **Prisma 7** ·
Node 26.

Feature **001 Authentication** is complete: registration, sign-in, sessions/devices, email
verification, password reset/change, push-token storage and account deletion.

## Prerequisites

- Node.js **26** (`.nvmrc`) and pnpm **12** (`npm i -g pnpm`)
- Docker (local Postgres)
- Optional: TruffleHog (`brew install trufflehog`) for the local pre-commit secret scan

## Getting started

```bash
pnpm install
cp .env.example .env              # then edit it (see "Configuration")
docker compose up -d              # Postgres: dev DB + e2e test DB
pnpm prisma:migrate               # apply migrations to the dev DB
pnpm start:dev                    # http://localhost:3000 (watch mode)
```

- Health: <http://localhost:3000/api/v1/health>
- Swagger: <http://localhost:3000/docs> (`SWAGGER_ENABLED=true`; never in production)

## Scripts

| Command                                        | What it does                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm start:dev`                               | API in watch mode                                                           |
| `pnpm build` / `pnpm start:prod`               | Compile to `dist/` / run the build                                          |
| `pnpm lint` · `pnpm format` · `pnpm typecheck` | ESLint · Prettier · TypeScript                                              |
| `pnpm test` / `pnpm test:cov`                  | Unit tests (gate: 90% lines, 85% branches)                                  |
| `pnpm test:e2e`                                | End-to-end tests against the test DB (`TEST_DATABASE_URL`)                  |
| `pnpm run ci`                                  | Lint, format, typecheck, build, unit tests with coverage (same order as CI) |
| `pnpm openapi:generate`                        | Build and write `openapi.json`                                              |
| `pnpm prisma:migrate` · `pnpm prisma studio`   | Migrations · browse the DB                                                  |

## Configuration

All variables are documented in `.env.example` and validated at startup (the app refuses to
boot on bad config). The important ones:

| Variable                                | Notes                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL` / `TEST_DATABASE_URL`    | Dev and e2e databases (match `docker-compose.yml`)                  |
| `JWT_ACCESS_SECRET`, `JWT_EMAIL_SECRET` | ≥32 chars, **different** from each other: `openssl rand -base64 48` |
| `APP_LINK_BASE_URL`                     | Base of links in emails (see below)                                 |
| `APP_DEEP_LINK_SCHEME`                  | App URL scheme, default `flashtrainer`                              |
| `MAIL_DRIVER`                           | `console` (log/capture) or `smtp` (real email)                      |
| `EMAIL_DNS_CHECK`                       | Reject emails whose domain can't receive mail (off in tests)        |
| `SWAGGER_ENABLED`                       | Must be `false` in production                                       |

### Sending real email with Gmail

1. Turn on **2-Step Verification** on the Google account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. In `.env`:
   ```
   MAIL_DRIVER=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=you@gmail.com
   SMTP_PASS=<the 16-character App Password>
   MAIL_FROM="Flash Trainer <you@gmail.com>"
   ```
   Fine for development (~500 emails/day; may land in spam). Use a transactional provider
   before launch; only `.env` changes.

### Email links on an emulator or phone

Links in emails point to the backend's landing page, which opens the app via
`flashtrainer://verify-email?token=…` or `flashtrainer://reset-password?token=…`.

| Where the app runs      | `APP_LINK_BASE_URL`                                 |
| ----------------------- | --------------------------------------------------- |
| Android emulator        | `http://10.0.2.2:3000/api/v1/links`                 |
| Phone on the same Wi-Fi | `http://<your-computer's-LAN-IP>:3000/api/v1/links` |

Test a deep link without email:

```bash
adb shell am start -a android.intent.action.VIEW -d "flashtrainer://verify-email?token=<token>"
```

With `MAIL_DRIVER=console` in development, the full email (including the link) is printed in
the `pnpm start:dev` terminal.

## API conventions

- Base path `/api/v1`. Every JSON response uses one envelope:
  - success: `{ "success": true, "data": …, "meta": { "requestId", "timestamp" } }`
  - error: `{ "success": false, "error": { "statusCode", "code", "message", "details?" }, "meta": … }`
- Branch on `error.code` (catalogued in Swagger), never on `message`. `meta.requestId`
  matches the `X-Request-Id` header and the server logs.
- Auth: `Authorization: Bearer <accessToken>`. On `AUTH_TOKEN_EXPIRED`, call
  `POST /auth/refresh` **once** (serialise refreshes), then retry. Any other 401 → sign in.

## Project structure

```
src/
├── common/      # errors, envelope, filter, interceptor, guard, decorators, validators, logging
├── config/      # env validation + typed AppConfigService
├── prisma/      # PrismaService (Prisma 7 + pg adapter)
├── health/      # GET /api/v1/health
└── modules/
    ├── auth/    # see src/modules/auth/README.md
    ├── users/   # see src/modules/users/README.md
    └── mail/    # see src/modules/mail/README.md
prisma/          # schema + migrations
test/            # e2e suites + helpers
```

## Development workflow

- Features are specified and planned with [Spec Kit](https://github.com/github/spec-kit):
  spec → plan → tasks → implement. Feature 001 lives in `specs/001-user-auth/`.
- Project rules (API contract, naming, testing, CI) are in the constitution:
  `.specify/memory/constitution.md`.
- Commits follow Conventional Commits; the pre-commit hook runs lint, Prettier and a
  TruffleHog scan of staged files.
- CI (GitHub Actions) runs 9 blocking jobs: secret scan, install, lint/format, typecheck,
  build, unit + coverage, e2e (real Postgres), boot + OpenAPI check, dependency audit.

> Note: `specs/` and `.specify/` are currently git-ignored, so the spec and constitution exist
> only locally until that changes.

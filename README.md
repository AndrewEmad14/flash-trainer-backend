# Flash Trainer: Backend

REST API for the Flash Trainer Flutter app, built with **NestJS 12**, **PostgreSQL** and **Prisma 7**.

> 🚧 Work in progress. Feature 001 (authentication) is being built.

## Prerequisites

- Node.js **26** (see `.nvmrc`)
- pnpm **12** (`npm i -g pnpm`)
- Docker (for the local database)
- Optional: TruffleHog (`brew install trufflehog`) for the local secret scan in the pre-commit hook

## Getting started

```bash
pnpm install
cp .env.example .env          # then fill in your own values
docker compose up -d          # Postgres (dev + test databases)
pnpm prisma:migrate           # apply database migrations
pnpm start:dev                # http://localhost:3000
```

- Health check: http://localhost:3000/api/v1/health
- API docs (Swagger): http://localhost:3000/docs (needs `SWAGGER_ENABLED=true`)

## Scripts

| Command                       | What it does                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm start:dev`              | Run the API in watch mode                                                                 |
| `pnpm build`                  | Compile to `dist/`                                                                        |
| `pnpm lint` / `pnpm format`   | ESLint / Prettier                                                                         |
| `pnpm typecheck`              | TypeScript type check                                                                     |
| `pnpm test` / `pnpm test:cov` | Unit tests (coverage gate: 90% lines / 85% branches)                                      |
| `pnpm test:e2e`               | End-to-end tests against the test database                                                |
| `pnpm run ci`                 | Run the main CI checks locally (lint, format, typecheck, build, unit tests with coverage) |
| `pnpm openapi:generate`       | Write `openapi.json`                                                                      |

## Project structure

```
src/
├── common/      # shared: errors, filters, guards, interceptors, decorators, logging
├── config/      # env validation + typed config
├── prisma/      # Prisma service
├── health/      # GET /api/v1/health
└── modules/     # one folder per feature (auth, users, mail, ...)
prisma/          # schema + migrations
test/            # e2e tests
```

## Conventions

The project rules live in the constitution (`.specify/memory/constitution.md`): API response
format, error codes, naming, testing and CI. Features are planned with
[Spec Kit](https://github.com/github/spec-kit) under `specs/`.

## TODO

- [ ] API usage notes (auth flow, error codes) once feature 001 is done
- [ ] Email setup (Gmail App Password) and mobile emulator link settings
- [ ] Deployment

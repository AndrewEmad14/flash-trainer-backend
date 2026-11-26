# Users module

Owns the `users` table: creating accounts, looking them up, and the public account view.
Other modules use `UsersService`, **never** `UsersRepository` (constitution §I).

## Endpoint

| Endpoint               | Auth   | Purpose                      |
| ---------------------- | ------ | ---------------------------- |
| `GET /api/v1/users/me` | bearer | The signed-in user's account |

`DELETE /users/me` is implemented in the auth module (`auth/account/`) because it needs
password checks from auth; Swagger still shows it under **Users**.

## Rules that aren't obvious

- **Email** is stored trimmed and lowercased; **username** is `citext` (unique ignoring case,
  shown as typed, 3–30 chars also enforced by a DB `CHECK`); **phone** is optional, E.164,
  unique when present.
- **Identity conflicts** (`USER_IDENTITY_TAKEN`) are reported for every taken field at once,
  both from the pre-check and from a real DB unique violation (race between sign-ups). See
  `user-identity.errors.ts`.
- `toUserResponse()` never maps `passwordHash`; missing optional values are `null`.
- Deleting a user cascades to sessions, reset links and email dispatches at the DB level.
- `passwordHash` is nullable in the DB for future social sign-in; every current flow sets it.

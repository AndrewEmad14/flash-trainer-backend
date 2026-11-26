import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { AuthThrottle } from '../../common/decorators/auth-throttle.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { AuthResultDto } from './dto/auth-result.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SessionsService } from './sessions/sessions.service';
import { RegisterDto } from './dto/register.dto';

/** Account and session endpoints (contracts/auth-api.md). HTTP only; logic is in AuthService. */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * POST /api/v1/auth/register (US1).
   *
   * @throws AppException VALIDATION_FAILED, USER_IDENTITY_TAKEN, RATE_LIMIT_EXCEEDED.
   */
  @Post('register')
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register with email and password',
    description: `Creates an account and **signs this device in immediately**, then emails a verification link valid for 24 hours. The user can use the app before verifying.

- The email is trimmed and lowercased. Emails and usernames are unique regardless of letter case.
- Format problems are reported first, all fields at once (\`VALIDATION_FAILED\`).
- Then the email's domain must be able to receive mail. If it can't (e.g. a typo like \`gmial.con\`), the response is \`VALIDATION_FAILED\` with a \`FIELD_EMAIL_DOMAIN_INVALID\` detail on \`email\`; show "check the part after the @". If the lookup itself fails or times out, the email is accepted.
- Finally, all taken fields are reported at once (\`USER_IDENTITY_TAKEN\`, with \`USER_EMAIL_TAKEN\`, \`USER_USERNAME_TAKEN\` and/or \`USER_PHONE_TAKEN\` in \`details\`).
- Rate limited to 10 requests per minute per IP.`,
  })
  @ApiEnvelopeResponse(AuthResultDto, {
    status: HttpStatus.CREATED,
    description: 'Account created and device signed in.',
  })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.USER_IDENTITY_TAKEN,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  register(@Body() dto: RegisterDto): Promise<AuthResultDto> {
    return this.auth.register(dto);
  }

  /**
   * POST /api/v1/auth/login (US2).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_INVALID_CREDENTIALS, AUTH_TOO_MANY_ATTEMPTS,
   *   RATE_LIMIT_EXCEEDED.
   */
  @Post('login')
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with email or username',
    description: `Signs this device in and returns new tokens. Each sign-in creates a separate device session.

- \`identifier\` may be the email or the username (both case-insensitive).
- A wrong password and an unknown account return the **same** \`AUTH_INVALID_CREDENTIALS\` error, so the response never reveals whether an account exists.
- After **5 failed attempts within 15 minutes**, sign-in is blocked for 15 minutes, even with the correct password. The response is \`AUTH_TOO_MANY_ATTEMPTS\` (429), with a \`Retry-After\` header in seconds for a countdown. Unknown identifiers are locked the same way.
- Rate limited to 10 requests per minute per IP.`,
  })
  @ApiEnvelopeResponse(AuthResultDto, { description: 'Signed in.' })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_INVALID_CREDENTIALS,
    ErrorCode.AUTH_TOO_MANY_ATTEMPTS,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  login(@Body() dto: LoginDto): Promise<AuthResultDto> {
    return this.auth.login(dto);
  }

  /**
   * POST /api/v1/auth/refresh (US3).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_SESSION_INVALID, AUTH_SESSION_EXPIRED,
   *   RATE_LIMIT_EXCEEDED.
   */
  @Post('refresh')
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the session (get new tokens)',
    description: `Exchanges the refresh token for a **new access token and a new refresh token**. The old refresh token stops working immediately (rotation), and the session's 30-day expiry restarts from now.

**When to call it:** when any request fails with \`AUTH_TOKEN_EXPIRED\`, refresh, then retry the original request.

**⚠️ Only one refresh at a time.** Each refresh token works exactly once. If the app sends two refreshes in parallel with the same token, one succeeds and the other gets \`AUTH_SESSION_INVALID\`. Queue requests behind a single in-flight refresh.

**Errors:** \`AUTH_SESSION_EXPIRED\` (not used for 30 days) or \`AUTH_SESSION_INVALID\` (signed out, already used, or account deleted) both mean: clear the stored tokens and show the sign-in screen.`,
  })
  @ApiEnvelopeResponse(AuthTokensDto, { description: 'New tokens for the same session.' })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_SESSION_INVALID,
    ErrorCode.AUTH_SESSION_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.sessions.refresh(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout (US5). Always succeeds once the body is valid.
   *
   * @throws AppException VALIDATION_FAILED, RATE_LIMIT_EXCEEDED.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out this device',
    description: `Ends the session that owns the given refresh token. **Public:** it needs no access token, so it works even after the access token expired.

- Idempotent: an unknown, already-used or already-revoked token also returns 200.
- The app should **always** delete its stored tokens and show the sign-in screen, whatever this call returns (even offline).
- The device's push-notification token is detached from the session.
- An access token issued before sign-out keeps working until it expires (at most 15 minutes). The refresh token stops working immediately.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Signed out (or nothing to sign out).' })
  @ApiErrorResponses(ErrorCode.VALIDATION_FAILED, ErrorCode.RATE_LIMIT_EXCEEDED)
  async logout(@Body() dto: RefreshTokenDto): Promise<null> {
    await this.sessions.logoutByRefreshToken(dto.refreshToken);
    return null;
  }

  /**
   * POST /api/v1/auth/logout-all (US5).
   *
   * @throws AppException AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED,
   *   RATE_LIMIT_EXCEEDED.
   */
  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out of all devices',
    description: `Ends **every** session of the signed-in user, including this one, for example after losing a phone.

- Every device's refresh token stops working immediately. Their access tokens expire within 15 minutes.
- Afterwards, this app should delete its stored tokens and show the sign-in screen, as for a normal sign-out.`,
  })
  @ApiEnvelopeResponse(null, { description: 'All sessions ended.' })
  @ApiErrorResponses(
    ErrorCode.AUTH_TOKEN_MISSING,
    ErrorCode.AUTH_TOKEN_INVALID,
    ErrorCode.AUTH_TOKEN_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    await this.sessions.revokeAll(user.userId);
    return null;
  }
}

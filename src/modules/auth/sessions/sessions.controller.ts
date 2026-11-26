import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../../common/http/authenticated-request';
import { uuidParam } from '../../../common/pipes/uuid-param.pipe';
import { SessionResponseDto } from '../dto/session-response.dto';
import { UpdatePushTokenDto } from '../dto/update-push-token.dto';
import { SessionsService } from './sessions.service';

const TOKEN_ERRORS = [
  ErrorCode.AUTH_TOKEN_MISSING,
  ErrorCode.AUTH_TOKEN_INVALID,
  ErrorCode.AUTH_TOKEN_EXPIRED,
  ErrorCode.RATE_LIMIT_EXCEEDED,
] as const;

/** The signed-in user's devices (US6). HTTP only; logic lives in SessionsService. */
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /**
   * GET /api/v1/auth/sessions (US6).
   *
   * @throws AppException AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED.
   */
  @Get()
  @ApiOperation({
    summary: 'List my signed-in devices',
    description: `Returns every **active** device session of the signed-in user, most recently used first. Signed-out and expired sessions are not included.

- \`isCurrent\` marks the device making this request.
- \`lastUsedAt\` updates on each refresh, so it's accurate to about 15 minutes.
- Not paginated: a user only has a handful of devices.`,
  })
  @ApiEnvelopeResponse(SessionResponseDto, { isArray: true, description: 'Active devices.' })
  @ApiErrorResponses(...TOKEN_ERRORS)
  list(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponseDto[]> {
    return this.sessions.listForUser(user.userId, user.sessionId);
  }

  /**
   * DELETE /api/v1/auth/sessions/:sessionId (US6).
   *
   * @throws AppException VALIDATION_FAILED, SESSION_NOT_FOUND, AUTH_TOKEN_MISSING,
   *   AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED.
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'sessionId',
    description: 'Id of one of my active sessions (from GET /auth/sessions).',
    format: 'uuid',
    example: 'b2d4f6a8-1c3e-4a5b-9d7f-0e2c4a6b8d10',
  })
  @ApiOperation({
    summary: 'Sign out one of my devices',
    description: `Ends one of the signed-in user's own sessions, e.g. a lost phone. That device's refresh token stops working immediately, and its access token expires within 15 minutes.

- Passing the current device's id is allowed, and works like signing out.
- An unknown, already-ended, or someone else's session id returns \`SESSION_NOT_FOUND\` (404). All three look the same.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Device signed out.' })
  @ApiErrorResponses(ErrorCode.VALIDATION_FAILED, ErrorCode.SESSION_NOT_FOUND, ...TOKEN_ERRORS)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam('sessionId')) sessionId: string,
  ): Promise<null> {
    await this.sessions.revokeOwnSession(user.userId, sessionId);
    return null;
  }

  /**
   * PUT /api/v1/auth/sessions/current/push-token (US10).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_SESSION_INVALID, AUTH_TOKEN_*.
   */
  @Put('current/push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Save this device's push-notification token",
    description: `Attaches the device's FCM registration token to the session making the request, replacing any earlier one. Call it after signing in, and again whenever Firebase gives the app a new token.

- If another session already has the same token (e.g. the same phone signed in again), it's moved to this session, so a device never gets duplicate notifications.
- Signing out (this device, remotely, or everywhere) drops the token.
- \`AUTH_SESSION_INVALID\`: this session was signed out or expired. Sign in again.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Token saved.' })
  @ApiErrorResponses(ErrorCode.VALIDATION_FAILED, ErrorCode.AUTH_SESSION_INVALID, ...TOKEN_ERRORS)
  async updatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePushTokenDto,
  ): Promise<null> {
    await this.sessions.updatePushToken(user.sessionId, dto.pushToken);
    return null;
  }
}

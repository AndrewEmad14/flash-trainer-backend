import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { AuthThrottle } from '../../../common/decorators/auth-throttle.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { PasswordResetService } from './password-reset.service';

/** Forgot / reset password (US8). HTTP only; logic lives in PasswordResetService. */
@ApiTags('Auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /**
   * POST /api/v1/auth/password-reset (US8). Always 200 once the body is valid.
   *
   * @throws AppException VALIDATION_FAILED, RATE_LIMIT_EXCEEDED.
   */
  @Post()
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forgot password: email a reset link',
    description: `Emails a password-reset link (valid **1 hour**, usable **once**) if an account exists for this email.

- **Always returns 200 with \`data: null\`**, whether or not the account exists, so nobody can find out who's registered. Show something like "If an account exists, we've sent an email".
- Asking again replaces the earlier link.
- At most one email per minute and 5 per 24 hours per account. Extra requests are silently ignored, with the same 200.`,
  })
  @ApiEnvelopeResponse(null, {
    description: 'Accepted (an email is sent only if the account exists).',
  })
  @ApiErrorResponses(ErrorCode.VALIDATION_FAILED, ErrorCode.RATE_LIMIT_EXCEEDED)
  requestReset(@Body() dto: RequestPasswordResetDto): null {
    this.resets.request(dto.email);
    return null;
  }

  /**
   * POST /api/v1/auth/password-reset/confirm (US8).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_LINK_INVALID, AUTH_LINK_USED, AUTH_LINK_EXPIRED.
   */
  @Post('confirm')
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password from a reset link',
    description: `Sets the new password using the \`token\` from the reset link. On success, **every device is signed out** and no tokens are returned: send the user to the sign-in screen.

- \`AUTH_LINK_USED\`: the link was already used. \`AUTH_LINK_EXPIRED\`: older than 1 hour. \`AUTH_LINK_INVALID\`: unknown, or replaced by a newer request. For all three, offer "send a new link".
- A weak password returns \`VALIDATION_FAILED\` with \`AUTH_PASSWORD_TOO_WEAK\` on \`newPassword\`. The link stays usable.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Password changed; all devices signed out.' })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_LINK_INVALID,
    ErrorCode.AUTH_LINK_USED,
    ErrorCode.AUTH_LINK_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async confirmReset(@Body() dto: ConfirmPasswordResetDto): Promise<null> {
    await this.resets.confirm(dto.token, dto.newPassword);
    return null;
  }
}

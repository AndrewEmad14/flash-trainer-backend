import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { AuthThrottle } from '../../../common/decorators/auth-throttle.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../../common/http/authenticated-request';
import { ConfirmEmailVerificationDto } from '../dto/confirm-email-verification.dto';
import { EmailVerificationResultDto } from '../dto/email-verification-result.dto';
import { EmailVerificationService } from './email-verification.service';

/** Email verification (US7). HTTP only; logic lives in EmailVerificationService. */
@ApiTags('Auth')
@Controller('auth/email-verification')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  /**
   * POST /api/v1/auth/email-verification (US7): resend the link.
   *
   * @throws AppException AUTH_EMAIL_ALREADY_VERIFIED, RATE_LIMIT_EXCEEDED, AUTH_TOKEN_*.
   */
  @Post()
  @ApiBearerAuth()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the verification email',
    description: `Emails a new verification link (valid 24 hours) to the signed-in user.

- At most **one email per minute and 5 per 24 hours**. Otherwise \`RATE_LIMIT_EXCEEDED\` (429), with \`Retry-After\` in seconds for a countdown.
- \`AUTH_EMAIL_ALREADY_VERIFIED\` (409) when there's nothing to verify. Hide the banner.
- Older links keep working until they expire.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Email sent.' })
  @ApiErrorResponses(
    ErrorCode.AUTH_EMAIL_ALREADY_VERIFIED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.AUTH_TOKEN_MISSING,
    ErrorCode.AUTH_TOKEN_INVALID,
    ErrorCode.AUTH_TOKEN_EXPIRED,
  )
  async resend(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    await this.verification.resend(user.userId);
    return null;
  }

  /**
   * POST /api/v1/auth/email-verification/confirm (US7).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_LINK_INVALID, AUTH_LINK_EXPIRED.
   */
  @Post('confirm')
  @Public()
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an email address',
    description: `Verifies the email using the \`token\` from the verification link. **Public:** works without signing in, because the app receives the token via the \`flashtrainer://verify-email?token=…\` deep link.

- Opening a link again after verifying is **not an error**: it returns \`alreadyVerified: true\`.
- \`AUTH_LINK_EXPIRED\`: older than 24 hours. Offer "send a new link".
- \`AUTH_LINK_INVALID\`: tampered, for a deleted account, or the email changed since it was sent.`,
  })
  @ApiEnvelopeResponse(EmailVerificationResultDto, { description: 'Email verified.' })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_LINK_INVALID,
    ErrorCode.AUTH_LINK_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  confirm(@Body() dto: ConfirmEmailVerificationDto): Promise<EmailVerificationResultDto> {
    return this.verification.confirm(dto.token);
  }
}

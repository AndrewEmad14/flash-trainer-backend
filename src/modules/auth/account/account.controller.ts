import { Body, Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { AuthThrottle } from '../../../common/decorators/auth-throttle.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../../common/http/authenticated-request';
import { AuthService } from '../auth.service';
import { DeleteAccountDto } from '../dto/delete-account.dto';

/**
 * Account deletion (US11). This lives in the auth module, not users, because it needs
 * password verification and sign-in-throttle cleanup from auth. Putting it in users would
 * create a users ↔ auth module cycle (§I). Swagger lists it under "Users".
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class AccountController {
  constructor(private readonly auth: AuthService) {}

  /**
   * DELETE /api/v1/users/me (US11).
   *
   * @throws AppException VALIDATION_FAILED, AUTH_CURRENT_PASSWORD_INCORRECT, AUTH_TOKEN_*,
   *   RATE_LIMIT_EXCEEDED.
   */
  @Delete('me')
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete my account',
    description: `**Permanently** deletes the signed-in user's account after confirming the password. This can't be undone.

- Removes the account and everything tied to it (devices, reset links, email history).
- **Every device loses access** immediately. The app should then clear its tokens and go to the welcome screen.
- The email, username and phone can be used for a new registration afterwards.
- A wrong password returns **403** \`AUTH_CURRENT_PASSWORD_INCORRECT\` (not 401, so the app doesn't sign the user out over a typo), and nothing is deleted.
- Required by the App Store and Google Play: account deletion must be available inside the app.`,
  })
  @ApiEnvelopeResponse(null, { description: 'Account deleted.' })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_CURRENT_PASSWORD_INCORRECT,
    ErrorCode.AUTH_TOKEN_MISSING,
    ErrorCode.AUTH_TOKEN_INVALID,
    ErrorCode.AUTH_TOKEN_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<null> {
    await this.auth.deleteAccount(user.userId, dto.password);
    return null;
  }
}

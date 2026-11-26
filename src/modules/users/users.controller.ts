import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/** The signed-in user's own account. HTTP only; logic lives in UsersService. */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * GET /api/v1/users/me (US4).
   *
   * @throws AppException AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get my account',
    description: `Returns the signed-in user's own account. Call it when the app starts, for example to decide whether to show the "verify your email" banner (\`isEmailVerified\`).

- \`phone\` is \`null\` when not set. Every field is always present.
- Never contains the password or any token.
- Works for unverified accounts.
- \`AUTH_TOKEN_EXPIRED\` → refresh, then retry. Any other 401 → sign in again.`,
  })
  @ApiEnvelopeResponse(UserResponseDto, { description: 'The account.' })
  @ApiErrorResponses(
    ErrorCode.AUTH_TOKEN_MISSING,
    ErrorCode.AUTH_TOKEN_INVALID,
    ErrorCode.AUTH_TOKEN_EXPIRED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.users.getMe(user.userId);
  }
}

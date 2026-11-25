import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { AuthThrottle } from '../../common/decorators/auth-throttle.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import { AuthService } from './auth.service';
import { AuthResultDto } from './dto/auth-result.dto';
import { RegisterDto } from './dto/register.dto';

/** Account and session endpoints (contracts/auth-api.md). HTTP only; logic is in AuthService. */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
- Format problems are reported first, all fields at once (\`VALIDATION_FAILED\`). If the format is valid, all taken fields are reported at once (\`USER_IDENTITY_TAKEN\`, with \`USER_EMAIL_TAKEN\`, \`USER_USERNAME_TAKEN\` and/or \`USER_PHONE_TAKEN\` in \`details\`).
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
}

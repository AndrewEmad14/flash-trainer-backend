import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { toUserResponse } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification/email-verification.service';
import { LoginThrottleService } from './login-throttle/login-throttle.service';
import { PasswordHasherService } from './passwords/password-hasher.service';
import { SessionsService } from './sessions/sessions.service';

/** Orchestrates the auth flows. Business rules live in the services it calls. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordHasherService,
    private readonly sessions: SessionsService,
    private readonly emailVerification: EmailVerificationService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  /**
   * Registers an account and signs this device in (US1, FR-001 to FR-007).
   *
   * @param dto - Validated, normalised registration data.
   * @returns The new account and this device's tokens.
   * @throws AppException USER_IDENTITY_TAKEN when email, username or phone is already used.
   */
  async register(dto: RegisterDto): Promise<AuthResultDto> {
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.createUser({
      fullName: dto.fullName,
      username: dto.username,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
    });
    const tokens = await this.sessions.createSession(user.id, {
      deviceName: dto.deviceName,
      deviceOs: dto.deviceOs,
    });
    await this.emailVerification.sendVerificationEmail(user);
    return { user: toUserResponse(user), tokens };
  }

  /**
   * Signs a device in with email-or-username plus password (US2, FR-008 to FR-011).
   * Unknown accounts and wrong passwords get the same error and take about the same time,
   * and both count towards the lock, so nothing reveals whether an account exists (SC-004).
   *
   * @param dto - Validated sign-in data.
   * @returns The account and this device's tokens.
   * @throws AppException AUTH_TOO_MANY_ATTEMPTS while the account (or identifier) is locked,
   *   even if the password is correct.
   * @throws AppException AUTH_INVALID_CREDENTIALS for an unknown identifier or wrong password.
   */
  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.users.findByIdentifier(dto.identifier);
    const throttleKey = this.loginThrottle.keyFor(user?.id ?? null, dto.identifier);
    await this.loginThrottle.assertNotLocked(throttleKey);

    const isValid = user?.passwordHash
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyDummy(dto.password);
    if (!user || !isValid) {
      await this.loginThrottle.registerFailure(throttleKey);
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    await this.loginThrottle.reset(throttleKey);
    const tokens = await this.sessions.createSession(user.id, {
      deviceName: dto.deviceName,
      deviceOs: dto.deviceOs,
    });
    return { user: toUserResponse(user), tokens };
  }
}

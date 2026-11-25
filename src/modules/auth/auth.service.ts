import { Injectable } from '@nestjs/common';
import { toUserResponse } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import type { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification/email-verification.service';
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
}

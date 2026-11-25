import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailDispatchRepository } from './email-dispatch/email-dispatch.repository';
import { EmailDispatchService } from './email-dispatch/email-dispatch.service';
import { EmailVerificationService } from './email-verification/email-verification.service';
import { PasswordHasherService } from './passwords/password-hasher.service';
import { SessionsRepository } from './sessions/sessions.repository';
import { SessionsService } from './sessions/sessions.service';
import { TokenService } from './tokens/token.service';

/** Authentication & account security (feature 001). */
@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasherService,
    TokenService,
    SessionsRepository,
    SessionsService,
    EmailDispatchRepository,
    EmailDispatchService,
    EmailVerificationService,
  ],
})
export class AuthModule {}

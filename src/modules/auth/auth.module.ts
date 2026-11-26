import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService } from './auth.service';
import { DnsResolver } from './email-domain/dns-resolver';
import { EMAIL_DNS_CHECK_ENABLED, EmailDomainService } from './email-domain/email-domain.service';
import { EmailDispatchRepository } from './email-dispatch/email-dispatch.repository';
import { EmailDispatchService } from './email-dispatch/email-dispatch.service';
import { EmailVerificationController } from './email-verification/email-verification.controller';
import { EmailVerificationService } from './email-verification/email-verification.service';
import { LinksController } from './links/links.controller';
import { LoginAttemptsRepository } from './login-throttle/login-attempts.repository';
import { LoginThrottleService } from './login-throttle/login-throttle.service';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { PasswordResetService } from './password-reset/password-reset.service';
import { PasswordResetsRepository } from './password-reset/password-resets.repository';
import { PasswordHasherService } from './passwords/password-hasher.service';
import { SessionsController } from './sessions/sessions.controller';
import { SessionsRepository } from './sessions/sessions.repository';
import { SessionsService } from './sessions/sessions.service';
import { TokenService } from './tokens/token.service';

/** Authentication & account security (feature 001). */
@Module({
  imports: [UsersModule, MailModule],
  controllers: [
    AuthController,
    SessionsController,
    EmailVerificationController,
    LinksController,
    PasswordResetController,
  ],
  providers: [
    AuthService,
    PasswordHasherService,
    TokenService,
    SessionsRepository,
    SessionsService,
    EmailDispatchRepository,
    EmailDispatchService,
    EmailVerificationService,
    LoginAttemptsRepository,
    LoginThrottleService,
    DnsResolver,
    PasswordResetsRepository,
    PasswordResetService,
    EmailDomainService,
    {
      provide: EMAIL_DNS_CHECK_ENABLED,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.emailDnsCheckEnabled,
    },
  ],
})
export class AuthModule {}

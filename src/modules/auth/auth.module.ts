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
import { EmailVerificationService } from './email-verification/email-verification.service';
import { LoginAttemptsRepository } from './login-throttle/login-attempts.repository';
import { LoginThrottleService } from './login-throttle/login-throttle.service';
import { PasswordHasherService } from './passwords/password-hasher.service';
import { SessionsController } from './sessions/sessions.controller';
import { SessionsRepository } from './sessions/sessions.repository';
import { SessionsService } from './sessions/sessions.service';
import { TokenService } from './tokens/token.service';

/** Authentication & account security (feature 001). */
@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController, SessionsController],
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
    EmailDomainService,
    {
      provide: EMAIL_DNS_CHECK_ENABLED,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.emailDnsCheckEnabled,
    },
  ],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { createMailService } from './mail.factory';
import { MailService } from './mail.service';

/** Provides {@link MailService} backed by the adapter selected in `MAIL_DRIVER`. */
@Module({
  providers: [{ provide: MailService, inject: [AppConfigService], useFactory: createMailService }],
  exports: [MailService],
})
export class MailModule {}

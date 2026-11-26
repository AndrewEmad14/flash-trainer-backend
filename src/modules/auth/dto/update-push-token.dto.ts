import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/utils/normalize.util';

/** Body of `PUT /auth/sessions/current/push-token` (data-model.md AuthSession.fcmToken). */
export class UpdatePushTokenDto {
  @ApiProperty({
    description:
      "This device's Firebase Cloud Messaging registration token, from `FirebaseMessaging.instance.getToken()`. Send it after sign-in and whenever Firebase refreshes it.",
    example: 'dQw4w9WgXcQ:APA91bH…',
    maxLength: 4096,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  pushToken: string;
}

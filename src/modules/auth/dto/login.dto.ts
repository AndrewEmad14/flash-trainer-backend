import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/utils/normalize.util';

const trim = ({ value }: { value: unknown }): unknown => trimString(value);

/**
 * Body of `POST /auth/login`. The password isn't checked against the policy here: sign-in
 * must not reveal password rules, and the length cap only protects the hasher.
 */
export class LoginDto {
  @ApiProperty({
    description:
      'Email or username. A value containing "@" is treated as an email (case-insensitive); otherwise as a username (case-insensitive).',
    example: 'ahmed@mail.com',
    maxLength: 254,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;

  @ApiProperty({
    description: 'Account password, exactly as typed.',
    example: 's3cretPass',
    format: 'password',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description: 'Name of this device, shown in the device list.',
    example: 'Pixel 9',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Operating system of this device, shown in the device list.',
    example: 'Android 16',
    maxLength: 50,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  deviceOs?: string;
}

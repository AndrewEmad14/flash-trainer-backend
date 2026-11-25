import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthTokensDto } from './auth-tokens.dto';

/** Returned by register and login: the account plus this device's tokens. */
export class AuthResultDto {
  @ApiProperty({ description: 'The signed-in account.', type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ description: 'Tokens for this device session.', type: AuthTokensDto })
  tokens: AuthTokensDto;
}

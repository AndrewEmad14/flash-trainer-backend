import { ApiProperty } from '@nestjs/swagger';

/** Result of confirming an email (FR-019, FR-020). */
export class EmailVerificationResultDto {
  @ApiProperty({ description: 'Always true on success.', example: true })
  isEmailVerified: boolean;

  @ApiProperty({
    description:
      'True when the email had already been verified before this request (e.g. the link was opened twice). Not an error.',
    example: false,
  })
  alreadyVerified: boolean;
}

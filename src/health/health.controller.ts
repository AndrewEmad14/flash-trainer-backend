import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { ApiEnvelopeResponse } from '../common/decorators/api-envelope-response.decorator';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';

/** Liveness/readiness probe used by CI job 8 and deployments (constitution Observability). */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Checks that the API is up and can reach the database.
   *
   * @returns The terminus health report.
   * @throws ServiceUnavailableException mapped to SERVICE_UNAVAILABLE (503) when the DB is down.
   */
  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Check service health',
    description:
      'Public. Returns 200 when the API is running and the database answers a ping. Returns 503 `SERVICE_UNAVAILABLE` otherwise. Which dependency failed is logged, never returned.',
  })
  @ApiEnvelopeResponse(HealthResponseDto)
  @ApiErrorResponses(ErrorCode.SERVICE_UNAVAILABLE, ErrorCode.RATE_LIMIT_EXCEEDED)
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
  }
}

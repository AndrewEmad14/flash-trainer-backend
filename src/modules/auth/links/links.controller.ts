import { Controller, Get, HttpStatus, Param, Query, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipEnvelope } from '../../../common/decorators/skip-envelope.decorator';
import { AppConfigService } from '../../../config/app-config.service';
import { deepLinkFor, errorPage, isLinkType, landingPage, LINK_TYPES } from './links.page';

/**
 * Email landing pages (research R3/R4). This is a **non-API page** under the constitution
 * §III.1 exemption (v1.1.0): it returns HTML instead of the envelope, changes no state, and
 * is listed in the plan's Complexity Tracking.
 */
@ApiTags('Email links')
@Controller('links')
export class LinksController {
  constructor(private readonly config: AppConfigService) {}

  /** GET /api/v1/links/:type?token=…: HTML page that opens the app. */
  @Get(':type')
  @Public()
  @SkipEnvelope()
  @ApiProduces('text/html')
  @ApiOperation({
    summary: 'Email link landing page (HTML)',
    description:
      'Not part of the app API. This is the page that links in verification and password-reset emails point to. It redirects to the app (`flashtrainer://<type>?token=…`) and shows an "Open Flash Trainer" button as a fallback. It does not verify or consume anything; the app calls the matching POST endpoint with the token.',
  })
  @ApiParam({ name: 'type', enum: LINK_TYPES, description: 'Which app screen to open.' })
  @ApiQuery({ name: 'token', description: 'Token from the email, passed to the app untouched.' })
  @ApiResponse({ status: 200, description: 'HTML page that opens the app.' })
  @ApiResponse({ status: 400, description: 'HTML error page: the link has no token.' })
  @ApiResponse({ status: 404, description: 'HTML error page: unknown link type.' })
  open(@Param('type') type: string, @Query('token') token: unknown, @Res() res: Response): void {
    res.type('html').setHeader('Cache-Control', 'no-store');
    if (!isLinkType(type)) {
      res.status(HttpStatus.NOT_FOUND).send(errorPage('This link is not recognised.'));
      return;
    }
    if (typeof token !== 'string' || token.length === 0) {
      res.status(HttpStatus.BAD_REQUEST).send(errorPage('This link is incomplete.'));
      return;
    }
    const deepLink = deepLinkFor(this.config.links.deepLinkScheme, type, token);
    res.status(HttpStatus.OK).send(landingPage(type, deepLink));
  }
}

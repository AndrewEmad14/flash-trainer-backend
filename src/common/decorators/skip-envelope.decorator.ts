import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/**
 * Marks a non-API page (e.g. an HTML email landing page) whose response is NOT wrapped in
 * the JSON envelope. Allowed only under the constitution §III.1 non-API page exemption.
 */
export const SkipEnvelope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ENVELOPE_KEY, true);

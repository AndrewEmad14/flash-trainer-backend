import { Throttle } from '@nestjs/throttler';

/** Stricter per-IP limit for credential and email endpoints: 10 per minute (research R7). */
export const AUTH_THROTTLE = { limit: 10, ttl: 60_000 } as const;

/** Applies {@link AUTH_THROTTLE} instead of the global 100/min default. */
export const AuthThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: AUTH_THROTTLE });

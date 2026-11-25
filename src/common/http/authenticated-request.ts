import type { Request } from 'express';

/** The identity the JWT guard attaches to a request. */
export interface AuthenticatedUser {
  userId: string;
  /** The device session (`auth_sessions.id`) that issued the access token. */
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

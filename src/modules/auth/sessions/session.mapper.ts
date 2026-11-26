import type { AuthSession } from '../../../generated/prisma/client';
import type { SessionResponseDto } from '../dto/session-response.dto';

/**
 * Public view of a device session. The refresh-token hash and push token are never exposed.
 *
 * @param session - The stored session.
 * @param currentSessionId - The `sid` of the access token making the request.
 * @returns The API representation.
 */
export function toSessionResponse(
  session: AuthSession,
  currentSessionId: string,
): SessionResponseDto {
  return {
    id: session.id,
    deviceName: session.deviceName ?? null,
    deviceOs: session.deviceOs ?? null,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    isCurrent: session.id === currentSessionId,
  };
}

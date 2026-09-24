import { FarmDto } from '../farm.dto';

/**
 * Response shape for POST /api/v1/farms/me/invitation-code.
 * Extends FarmDto directly — the farm with its new code and expiry is
 * exactly what the client needs back, no divergence/wrapper required.
 */
export class RegenerateFarmInvitationCodeResponseDto extends FarmDto {}

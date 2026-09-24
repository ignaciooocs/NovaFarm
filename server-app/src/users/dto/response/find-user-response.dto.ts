import { UserDto } from '../user.dto';

/**
 * Response shape for a single item in GET /api/v1/users.
 * Extends UserDto directly — the listing returns each user's full
 * canonical shape (minus firebaseUid, already excluded from UserDto),
 * no divergence/wrapper required.
 */
export class FindUserResponseDto extends UserDto {}

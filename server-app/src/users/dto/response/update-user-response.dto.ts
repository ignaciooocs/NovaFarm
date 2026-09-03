import { UserDto } from '../user.dto';

/**
 * Response shape for PATCH /api/v1/users/me.
 * Extends UserDto directly — the updated user's full canonical shape is
 * exactly what the client needs back, no divergence/wrapper required.
 */
export class UpdateUserResponseDto extends UserDto {}

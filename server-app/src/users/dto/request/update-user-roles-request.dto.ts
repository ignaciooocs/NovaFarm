import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';

/**
 * Request shape for PATCH /api/v1/users/:id/roles (admin only). Full
 * replacement of the target's *non-admin* roles — the admin sends the
 * complete desired recorder/supervisor set, not an incremental add/remove.
 * Deliberately only accepts 'recorder' | 'supervisor' — never 'admin' — so
 * this endpoint can never grant a farm's admin role to someone new.
 *
 * If the target already has 'admin', it's preserved no matter what — this
 * endpoint can only add/remove recorder/supervisor *on top of* it (the
 * "admin who also anota" case, see ui-arquitectura.md §5), never take
 * 'admin' away. That's why an empty array is valid here even though a
 * non-admin target can't end up with zero roles (UsersService.updateRoles()
 * enforces that difference — an admin already has a role even with no
 * extras, a non-admin doesn't). Promoting/demoting *to* or *from* admin
 * itself has real edge cases (self-demotion, a farm left with no admin) not
 * designed yet; see UpdateUserRequestDto for the same reasoning applied to
 * /me.
 */
export class UpdateUserRolesRequestDto {
  @ApiProperty({
    description:
      'Desired recorder/supervisor roles for the user — never admin, see class doc. Can be empty when the target is already an admin.',
    enum: ['recorder', 'supervisor'],
    isArray: true,
    example: ['recorder', 'supervisor'],
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(['recorder', 'supervisor'], { each: true })
  roles!: Array<'recorder' | 'supervisor'>;
}

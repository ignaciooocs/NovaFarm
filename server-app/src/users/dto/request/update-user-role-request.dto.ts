import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Request shape for PATCH /api/v1/users/:id/role (admin only). Deliberately
 * only accepts 'recorder' | 'supervisor' — never 'admin' — so this endpoint
 * can never create or remove a farm's admin. Promoting/demoting an admin has
 * real edge cases (self-demotion, a farm left with no admin) not designed
 * yet; see UpdateUserRequestDto for the same reasoning applied to /me.
 * UsersService.updateRole() also rejects the request if the *current* role
 * of the target user is 'admin', so an admin can't be moved out of that role
 * through this endpoint either.
 */
export class UpdateUserRoleRequestDto {
  @ApiProperty({
    description: 'New role for the user — never admin, see class doc',
    enum: ['recorder', 'supervisor'],
    example: 'supervisor',
  })
  @IsIn(['recorder', 'supervisor'])
  role!: 'recorder' | 'supervisor';
}

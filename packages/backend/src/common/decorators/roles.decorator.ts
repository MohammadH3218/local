import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@handycall/shared';

export const ROLES_KEY = 'roles';

/**
 * Require specific roles for route access
 * Usage: @Roles(UserRole.OWNER, UserRole.ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

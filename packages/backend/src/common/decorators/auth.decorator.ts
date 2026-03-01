import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext, UserRole } from '@handycall/shared';

/**
 * Extract auth context from request
 * Usage: @Auth() auth: AuthContext
 */
export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);

/**
 * Extract company_id from auth context
 * Usage: @CompanyId() companyId: string
 */
export const CompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthContext | undefined;
    const override = request.headers?.['x-company-id'] || request.headers?.['x-company-id'.toLowerCase()];
    if (override && (user?.role === UserRole.ADMIN || user?.company_id === 'platform-admin')) {
      return String(override);
    }
    return user?.company_id || '';
  }
);

/**
 * Extract user_id from auth context
 * Usage: @UserId() userId: string
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.user_id;
  }
);

/**
 * Extract user role from auth context
 * Usage: @UserRole() role: UserRole
 */
export const UserRoleParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.role;
  }
);

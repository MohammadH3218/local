import { Controller, Get, Post, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRoleParam } from '../../common/decorators/auth.decorator';
import { UserRole } from '@handycall/shared';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  /**
   * Get system-wide statistics (admin only)
   */
  @Get('stats')
  async getSystemStats(@UserRoleParam() role: UserRole) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.adminService.getSystemStats();
  }

  /**
   * Get recent activity across all companies (admin only)
   */
  @Get('activity')
  async getRecentActivity(
    @UserRoleParam() role: UserRole,
    @Query('limit') limit?: string
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.adminService.getRecentActivity(limitNum);
  }

  /**
   * Get top companies by usage/revenue (admin only)
   */
  @Get('top-companies')
  async getTopCompanies(
    @UserRoleParam() role: UserRole,
    @Query('limit') limit?: string
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.getTopCompanies(limitNum);
  }

  /**
   * Cancel a company's subscription at period end (admin only)
   */
  @Post('companies/:id/cancel-subscription')
  async cancelSubscription(
    @UserRoleParam() role: UserRole,
    @Param('id') companyId: string
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.adminService.cancelSubscription(companyId);
  }

  /**
   * Suspend a company's account immediately (admin only)
   */
  @Post('companies/:id/suspend')
  async suspendCompany(
    @UserRoleParam() role: UserRole,
    @Param('id') companyId: string
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.adminService.suspendCompany(companyId);
  }
}

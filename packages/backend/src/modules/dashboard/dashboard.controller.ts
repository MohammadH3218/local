import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@CompanyId() companyId: string) {
    return this.dashboardService.getDashboardOverview(companyId);
  }

  @Get('overview')
  async getOverview(@CompanyId() companyId: string) {
    return this.dashboardService.getDashboardOverview(companyId);
  }

  @Get('insights')
  async getInsights(@CompanyId() companyId: string) {
    return this.dashboardService.getQuickInsights(companyId);
  }

  @Get('recent-calls')
  async getRecentCalls(@CompanyId() companyId: string) {
    return this.dashboardService.getRecentCalls(companyId);
  }

  @Get('upcoming-appointments')
  async getUpcomingAppointments(@CompanyId() companyId: string) {
    return this.dashboardService.getUpcomingAppointments(companyId);
  }
}

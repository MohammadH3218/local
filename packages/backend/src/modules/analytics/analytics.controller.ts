import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { PlanFeature, PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Controller('analytics')
@UseGuards(PlanFeatureGuard)
@PlanFeature('follow_up_sequences')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('calls')
  getCallMetrics(
    @CompanyId() companyId: string,
    @Query('days') days?: string,
  ) {
    return this.service.getCallMetrics(companyId, { days: days ? Number(days) : undefined });
  }

  @Get('sms')
  getSmsMetrics(
    @CompanyId() companyId: string,
    @Query('days') days?: string,
  ) {
    return this.service.getSmsMetrics(companyId, { days: days ? Number(days) : undefined });
  }

  @Get('leads')
  getLeadMetrics(
    @CompanyId() companyId: string,
    @Query('days') days?: string,
  ) {
    return this.service.getLeadMetrics(companyId, { days: days ? Number(days) : undefined });
  }
}

import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Module({
  imports: [],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PlanFeatureGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

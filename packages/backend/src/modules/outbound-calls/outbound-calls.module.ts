import { Module } from '@nestjs/common';
import { OutboundCallsService } from './outbound-calls.service';
import { OutboundCallsController } from './outbound-calls.controller';
import { CompaniesModule } from '../companies/companies.module';
import { CompanyNumbersModule } from '../company-numbers/company-numbers.module';
import { BillingModule } from '../billing/billing.module';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Module({
  imports: [CompaniesModule, CompanyNumbersModule, BillingModule],
  controllers: [OutboundCallsController],
  providers: [OutboundCallsService, PlanFeatureGuard],
  exports: [OutboundCallsService],
})
export class OutboundCallsModule {}

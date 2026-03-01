import { Module } from '@nestjs/common';
import { CompanyNumbersModule } from '../company-numbers/company-numbers.module';
import { AgentConfigModule } from '../agent-config/agent-config.module';
import { CompaniesModule } from '../companies/companies.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { BillingModule } from '../billing/billing.module';
import { RealtimeToolsController } from './realtime-tools.controller';
import { RealtimeToolsService } from './realtime-tools.service';
import { ToolsAuthGuard } from '../../common/guards/tools-auth.guard';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { FollowUpSequencesModule } from '../follow-up-sequences/follow-up-sequences.module';

@Module({
  imports: [
    CompaniesModule,
    AgentConfigModule,
    CompanyNumbersModule,
    KnowledgeModule,
    SchedulingModule,
    BillingModule,
    AppointmentsModule,
    WebhooksModule,
    FollowUpSequencesModule,
  ],
  controllers: [RealtimeToolsController],
  providers: [RealtimeToolsService, ToolsAuthGuard],
})
export class RealtimeToolsModule {}

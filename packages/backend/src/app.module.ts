import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { UsersModule } from './modules/users/users.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CallsModule } from './modules/calls/calls.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { FlaggedQuestionsModule } from './modules/flagged-questions/flagged-questions.module';
import { AgentConfigModule } from './modules/agent-config/agent-config.module';
import { PricingRulesModule } from './modules/pricing-rules/pricing-rules.module';
import { TelephonyModule } from './modules/telephony/telephony.module';
import { RagModule } from './modules/rag/rag.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { BillingModule } from './modules/billing/billing.module';
import { CompanyNumbersModule } from './modules/company-numbers/company-numbers.module';
import { RealtimeToolsModule } from './modules/realtime-tools/realtime-tools.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { CalendarIntegrationModule } from './modules/calendar-integration/calendar-integration.module';
import { PublicBookingModule } from './modules/public-booking/public-booking.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FollowUpSequencesModule } from './modules/follow-up-sequences/follow-up-sequences.module';
import { ChatModule } from './modules/chat/chat.module';
import { OutboundCallsModule } from './modules/outbound-calls/outbound-calls.module';
import { SmsAutomationModule } from './modules/sms-automation/sms-automation.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { TeamModule } from './modules/team/team.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { CustomerProfilesModule } from './modules/customer-profiles/customer-profiles.module';
import { QuoteRequestsModule } from './modules/quote-requests/quote-requests.module';
import { PortalMessagingModule } from './modules/portal-messaging/portal-messaging.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { ParameterStoreModule } from './infrastructure/config/config.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Infrastructure
    DatabaseModule,
    StorageModule,
    ParameterStoreModule,
    SchedulingModule,

    // Core modules
    AuthModule,
    CompaniesModule,
    UsersModule,
    ContactsModule,
    CallsModule,
    AppointmentsModule,
    KnowledgeModule,
    FlaggedQuestionsModule,
    AgentConfigModule,
    PricingRulesModule,
    TelephonyModule,
    RagModule,
    DashboardModule,
    AdminModule,
    BillingModule,
    CompanyNumbersModule,
    RealtimeToolsModule,
    CalendarIntegrationModule,
    PublicBookingModule,
    WebhooksModule,
    MessagesModule,
    NotificationsModule,
    FollowUpSequencesModule,
    ChatModule,
    OutboundCallsModule,
    SmsAutomationModule,
    AnalyticsModule,
    InvoicingModule,
    TeamModule,
    LeadsModule,
    ReviewsModule,
    MarketplaceModule,
    CustomerProfilesModule,
    QuoteRequestsModule,
    PortalMessagingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT Auth Guard - protects all routes by default unless marked as @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}

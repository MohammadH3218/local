import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { CalendarIntegrationModule } from '../calendar-integration/calendar-integration.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { FollowUpSequencesModule } from '../follow-up-sequences/follow-up-sequences.module';

@Module({
  imports: [forwardRef(() => CalendarIntegrationModule), WebhooksModule, FollowUpSequencesModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}

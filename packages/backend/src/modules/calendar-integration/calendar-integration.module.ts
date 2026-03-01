import { Module, forwardRef } from '@nestjs/common';
import { CalendarIntegrationController } from './calendar-integration.controller';
import { LegacyCalendarController } from './legacy-calendar.controller';
import { CalendarIntegrationService } from './calendar-integration.service';
import { GoogleCalendarService } from './providers/google-calendar.service';
import { MicrosoftCalendarService } from './providers/microsoft-calendar.service';
import { AppleCalendarService } from './providers/apple-calendar.service';
import { CompaniesModule } from '../companies/companies.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [CompaniesModule, forwardRef(() => AppointmentsModule)],
  controllers: [CalendarIntegrationController, LegacyCalendarController],
  providers: [
    CalendarIntegrationService,
    GoogleCalendarService,
    MicrosoftCalendarService,
    AppleCalendarService,
  ],
  exports: [CalendarIntegrationService],
})
export class CalendarIntegrationModule {}

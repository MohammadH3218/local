import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CalendarIntegrationService } from './calendar-integration.service';

/**
 * Legacy calendar integration routes for cal.com structure compatibility
 * Handles callbacks from cal.handycall.org
 */
@Controller('integrations')
@Public() // OAuth callbacks are public
export class LegacyCalendarController {
  constructor(private calendarService: CalendarIntegrationService) {}

  @Get('googlecalendar/callback')
  async handleGoogleCallbackLegacy(
    @Query('code') code: string,
    @Query('state') state: string
  ) {
    await this.calendarService.handleGoogleCallback(code, state);
    return {
      success: true,
      message: 'Google Calendar connected successfully',
      redirectUrl: '/dashboard/appointments?setup=complete'
    };
  }
}

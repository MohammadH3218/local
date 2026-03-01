import { Controller, Get, Post, Query, Body, Param, Res, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { CalendarIntegrationService } from './calendar-integration.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller('calendar-integration')
export class CalendarIntegrationController {
  constructor(
    private calendarService: CalendarIntegrationService,
    private configService: ConfigService,
  ) {}

  @Get('providers')
  async getAvailableProviders() {
    return {
      providers: [
        { id: 'GOOGLE', name: 'Google Calendar', available: true },
        { id: 'MICROSOFT', name: 'Outlook/Microsoft 365', available: true },
        { id: 'APPLE', name: 'Apple iCloud', available: true },
      ],
    };
  }

  @Public()
  @Get('test')
  async testEndpoint() {
    return {
      message: 'Calendar integration endpoints are accessible',
      timestamp: Date.now(),
    };
  }

  @Get('auth/google/url')
  async getGoogleAuthUrl(@CompanyId() companyId: string) {
    try {
      const url = await this.calendarService.getGoogleAuthUrl(companyId);
      console.log(`[CalendarIntegrationController] Generated Google auth URL for company ${companyId}`);
      return { url };
    } catch (error: any) {
      console.error('[CalendarIntegrationController] Error generating Google auth URL:', error.message);
      throw error;
    }
  }

  /**
   * Debug endpoint to check OAuth configuration (public for diagnostics)
   */
  @Public()
  @Get('debug/oauth-config')
  async debugOAuthConfig() {
    const config = await this.calendarService.getOAuthDebugInfo();
    return {
      google: {
        clientId: config.google.clientId ? `${config.google.clientId.substring(0, 20)}...` : 'NOT SET',
        clientSecret: config.google.clientSecret ? 'SET' : 'NOT SET',
        redirectUri: config.google.redirectUri || 'NOT SET',
      },
      microsoft: {
        clientId: config.microsoft.clientId ? `${config.microsoft.clientId.substring(0, 20)}...` : 'NOT SET',
        clientSecret: config.microsoft.clientSecret ? 'SET' : 'NOT SET',
        redirectUri: config.microsoft.redirectUri || 'NOT SET',
      },
      note: 'Ensure redirectUri matches exactly what is configured in the OAuth provider console',
    };
  }

  @Public()
  @Get('auth/google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    try {
      await this.calendarService.handleGoogleCallback(code, state);
      
      // Get frontend URL from config or default
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 
                         'https://handycall.org';
      
      // Redirect to frontend with success parameter
      const redirectUrl = `${frontendUrl}/dashboard/appointments?calendar=connected&provider=google`;
      
      console.log(`[CalendarIntegrationController] Google Calendar connected, redirecting to: ${redirectUrl}`);
      
      // Return HTML page that redirects immediately
      res.status(HttpStatus.OK).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Calendar Connected</title>
            <meta http-equiv="refresh" content="0;url=${redirectUrl}">
            <script>
              window.location.href = "${redirectUrl}";
            </script>
          </head>
          <body>
            <p>Calendar connected successfully! Redirecting...</p>
            <p>If you are not redirected, <a href="${redirectUrl}">click here</a>.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('[CalendarIntegrationController] Error handling Google callback:', error);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 
                         'https://handycall.org';
      const errorUrl = `${frontendUrl}/dashboard/appointments?calendar=error&message=${encodeURIComponent(error.message)}`;
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Error</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}">
            <script>
              setTimeout(() => window.location.href = "${errorUrl}", 3000);
            </script>
          </head>
          <body>
            <p>Error connecting calendar: ${error.message}</p>
            <p>Redirecting back...</p>
          </body>
        </html>
      `);
    }
  }

  @Get('auth/microsoft/url')
  async getMicrosoftAuthUrl(@CompanyId() companyId: string) {
    const url = await this.calendarService.getMicrosoftAuthUrl(companyId);
    return { url };
  }

  @Public()
  @Get('auth/microsoft/callback')
  async handleMicrosoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    console.log(`[CalendarIntegrationController] Microsoft callback received - code: ${code ? 'PRESENT' : 'MISSING'}, state: ${state || 'MISSING'}`);
    
    if (!code) {
      console.error('[CalendarIntegrationController] Missing authorization code in callback');
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 
                         'https://handycall.org';
      const errorUrl = `${frontendUrl}/dashboard/appointments?calendar=error&message=${encodeURIComponent('Authorization code is required')}`;
      return res.status(HttpStatus.BAD_REQUEST).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Error</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}">
            <script>
              setTimeout(() => window.location.href = "${errorUrl}", 3000);
            </script>
          </head>
          <body>
            <p>Error: Authorization code is required</p>
            <p>Redirecting back...</p>
          </body>
        </html>
      `);
    }

    if (!state) {
      console.error('[CalendarIntegrationController] Missing state (companyId) in callback');
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 
                         'https://handycall.org';
      const errorUrl = `${frontendUrl}/dashboard/appointments?calendar=error&message=${encodeURIComponent('State parameter (companyId) is required')}`;
      return res.status(HttpStatus.BAD_REQUEST).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Error</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}">
            <script>
              setTimeout(() => window.location.href = "${errorUrl}", 3000);
            </script>
          </head>
          <body>
            <p>Error: State parameter (companyId) is required</p>
            <p>Redirecting back...</p>
          </body>
        </html>
      `);
    }

    try {
      await this.calendarService.handleMicrosoftCallback(code, state);
      console.log(`[CalendarIntegrationController] Microsoft Calendar connected successfully for company: ${state}`);
      
      // Get frontend URL from config or default
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 
                         'https://handycall.org';
      
      // Redirect to frontend with success parameter
      const redirectUrl = `${frontendUrl}/dashboard/appointments?calendar=connected&provider=microsoft`;
      
      console.log(`[CalendarIntegrationController] Microsoft Calendar connected, redirecting to: ${redirectUrl}`);

      // Return HTML page that redirects immediately
      return res.status(HttpStatus.OK).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Calendar Connected</title>
            <meta http-equiv="refresh" content="0;url=${redirectUrl}">
            <script>
              window.location.href = "${redirectUrl}";
            </script>
          </head>
          <body>
            <p>Calendar connected successfully! Redirecting...</p>
            <p>If you are not redirected, <a href="${redirectUrl}">click here</a>.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('[CalendarIntegrationController] Error handling Microsoft callback:', error);
      console.error('[CalendarIntegrationController] Error details:', {
        message: error.message,
        stack: error.stack,
        code: code ? 'PRESENT' : 'MISSING',
        state: state || 'MISSING'
      });

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') ||
                         this.configService.get<string>('NEXT_PUBLIC_APP_URL') ||
                         'https://handycall.org';
      const errorUrl = `${frontendUrl}/dashboard/appointments?calendar=error&message=${encodeURIComponent(error.message)}`;
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Error</title>
            <meta http-equiv="refresh" content="3;url=${errorUrl}">
            <script>
              setTimeout(() => window.location.href = "${errorUrl}", 3000);
            </script>
          </head>
          <body>
            <p>Error connecting calendar: ${error.message}</p>
            <p>Redirecting back...</p>
          </body>
        </html>
      `);
    }
  }

  @Post('sync')
  async syncCalendar(@CompanyId() companyId: string) {
    await this.calendarService.syncCalendar(companyId);
    return { success: true, message: 'Calendar sync initiated' };
  }

  @Get('status')
  async getConnectionStatus(@CompanyId() companyId: string) {
    return this.calendarService.getConnectionStatus(companyId);
  }

  @Post('disconnect')
  async disconnectCalendar(@CompanyId() companyId: string) {
    await this.calendarService.disconnectCalendar(companyId);
    return { success: true, message: 'Calendar disconnected' };
  }

  @Post('auth/apple/connect')
  async connectAppleCalendar(
    @CompanyId() companyId: string,
    @Body() body: { email: string; appSpecificPassword: string; calendarPath?: string }
  ) {
    console.log(`[CalendarIntegrationController] Apple connect request - companyId: ${companyId ? 'PRESENT' : 'MISSING'}, email: ${body?.email ? 'PRESENT' : 'MISSING'}`);

    try {
      if (!companyId) {
        console.error('[CalendarIntegrationController] Company ID missing from request');
        throw new Error('Company ID is required. Please ensure you are authenticated.');
      }

      if (!body?.email || !body?.appSpecificPassword) {
        throw new Error('Email and app-specific password are required');
      }

      await this.calendarService.connectAppleCalendar(companyId, body.email, body.appSpecificPassword, body.calendarPath);

      console.log(`[CalendarIntegrationController] Apple Calendar connected successfully for company ${companyId}`);

      return {
        success: true,
        message: 'Apple Calendar connected successfully',
      };
    } catch (error: any) {
      console.error('[CalendarIntegrationController] Error connecting Apple Calendar:', {
        message: error.message,
        status: error.response?.status,
        companyId: companyId ? 'PRESENT' : 'MISSING',
        email: body?.email ? 'PRESENT' : 'MISSING'
      });

      // Throw the error so it returns proper HTTP error code
      throw error;
    }
  }
}

import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { GoogleCalendarService } from './providers/google-calendar.service';
import { MicrosoftCalendarService } from './providers/microsoft-calendar.service';
import { AppleCalendarService } from './providers/apple-calendar.service';
import { ConfigService } from '@nestjs/config';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

@Injectable()
export class CalendarIntegrationService {
  private readonly kmsPrefix = 'kms:';
  private readonly sensitiveCalendarFields = ['access_token', 'refresh_token', 'app_specific_password'] as const;
  private readonly kms?: KMSClient;
  private readonly kmsKeyId?: string;

  constructor(
    private companiesService: CompaniesService,
    @Inject(forwardRef(() => AppointmentsService))
    private appointmentsService: AppointmentsService,
    private googleCalendar: GoogleCalendarService,
    private microsoftCalendar: MicrosoftCalendarService,
    private appleCalendar: AppleCalendarService,
    private configService: ConfigService,
  ) {
    this.kmsKeyId =
      this.configService.get<string>('CALENDAR_KMS_KEY_ID') ||
      this.configService.get<string>('WEBHOOK_KMS_KEY_ID') ||
      undefined;
    if (this.kmsKeyId) {
      const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
      const endpoint =
        this.configService.get<string>('KMS_ENDPOINT') ||
        this.configService.get<string>('AWS_ENDPOINT_URL_KMS') ||
        this.configService.get<string>('AWS_LOCALSTACK_ENDPOINT');
      this.kms = new KMSClient({
        region,
        ...(endpoint ? { endpoint } : {}),
      });
    }
  }

  async getGoogleAuthUrl(companyId: string): Promise<string> {
    try {
      return await this.googleCalendar.getAuthUrl(companyId);
    } catch (error: any) {
      console.error('[CalendarIntegrationService] Error getting Google auth URL:', error);
      throw new BadRequestException(`Failed to generate Google OAuth URL: ${error.message}`);
    }
  }

  async getOAuthDebugInfo(): Promise<{
    google: { clientId: string; clientSecret: string; redirectUri: string };
    microsoft: { clientId: string; clientSecret: string; redirectUri: string };
  }> {
    const googleConfig = await this.googleCalendar.getOAuthConfig();
    const microsoftConfig = await this.microsoftCalendar.getOAuthConfig();

    return {
      google: googleConfig,
      microsoft: microsoftConfig,
    };
  }

  async handleGoogleCallback(code: string, state: string): Promise<void> {
    const companyId = state; // State contains companyId
    const tokens = await this.googleCalendar.exchangeCodeForTokens(code);
    const calendarTimezone = tokens?.access_token
      ? await this.googleCalendar.getPrimaryTimeZone(tokens.access_token)
      : null;

    await this.companiesService.updateCompany(companyId, {
      calendar_provider: 'GOOGLE',
      calendar_mode: 'EXTERNAL',
      calendar_connection: await this.encryptCalendarConnection({
        provider: 'GOOGLE',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        ...(calendarTimezone ? { timezone: calendarTimezone } : {}),
        connected_at: Date.now(),
      }),
      calendar_setup_completed: true,
    });

    // Initial sync
    await this.syncCalendar(companyId);
  }

  async getMicrosoftAuthUrl(companyId: string): Promise<string> {
    try {
      return await this.microsoftCalendar.getAuthUrl(companyId);
    } catch (error: any) {
      console.error('[CalendarIntegrationService] Error getting Microsoft auth URL:', error);
      throw new BadRequestException(`Failed to generate Microsoft OAuth URL: ${error.message}`);
    }
  }

  async handleMicrosoftCallback(code: string, state: string): Promise<void> {
    const companyId = state; // State contains companyId
    
    console.log(`[CalendarIntegrationService] Handling Microsoft callback for company: ${companyId}`);
    
    if (!companyId) {
      throw new Error('Company ID (state) is required');
    }

    // Verify company exists
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      console.error(`[CalendarIntegrationService] Company not found: ${companyId}`);
      throw new NotFoundException(`Company not found: ${companyId}`);
    }

    console.log(`[CalendarIntegrationService] Exchanging authorization code for tokens...`);
    let tokens;
    try {
      tokens = await this.microsoftCalendar.exchangeCodeForTokens(code);
      console.log(`[CalendarIntegrationService] Token exchange successful - access_token: ${tokens.access_token ? 'PRESENT' : 'MISSING'}, refresh_token: ${tokens.refresh_token ? 'PRESENT' : 'MISSING'}`);
    } catch (error: any) {
      console.error(`[CalendarIntegrationService] Failed to exchange code for tokens:`, error);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }

    const calendarTimezone = tokens?.access_token
      ? await this.microsoftCalendar.getMailboxTimeZone(tokens.access_token)
      : null;

    console.log(`[CalendarIntegrationService] Updating company calendar connection...`);
    try {
      await this.companiesService.updateCompany(companyId, {
        calendar_provider: 'MICROSOFT',
        calendar_mode: 'EXTERNAL',
        calendar_connection: await this.encryptCalendarConnection({
          provider: 'MICROSOFT',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          ...(calendarTimezone ? { timezone: calendarTimezone } : {}),
          connected_at: Date.now(),
        }),
        calendar_setup_completed: true,
      });
      console.log(`[CalendarIntegrationService] Company calendar connection updated successfully`);
    } catch (error: any) {
      console.error(`[CalendarIntegrationService] Failed to update company:`, error);
      throw new Error(`Failed to save calendar connection: ${error.message}`);
    }

    // Initial sync (don't fail if sync fails - connection is still successful)
    console.log(`[CalendarIntegrationService] Starting initial calendar sync...`);
    try {
      await this.syncCalendar(companyId);
      console.log(`[CalendarIntegrationService] Initial sync completed successfully`);
    } catch (error: any) {
      console.warn(`[CalendarIntegrationService] Initial sync failed (non-critical):`, error);
      // Don't throw - connection is still successful even if sync fails
    }
  }

  async syncCalendar(companyId: string): Promise<void> {
    const company = await this.companiesService.findById(companyId);

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.calendar_connection || company.calendar_mode !== 'EXTERNAL') {
      throw new BadRequestException('No external calendar connected');
    }

    const provider = company.calendar_provider;

    if (provider === 'GOOGLE') {
      await this.syncGoogleCalendar(companyId, company);
    } else if (provider === 'MICROSOFT') {
      await this.syncMicrosoftCalendar(companyId, company);
    } else if (provider === 'APPLE') {
      await this.syncAppleCalendar(companyId, company);
    } else {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  private async syncGoogleCalendar(companyId: string, company: any): Promise<void> {
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);

    // Refresh token if needed
    const validTokens = await this.googleCalendar.ensureValidTokens(tokens);
    if (validTokens !== tokens) {
      await this.companiesService.updateCompany(companyId, {
        calendar_connection: await this.encryptCalendarConnection({ ...tokens, ...validTokens }),
      });
    }

    // Pull events from Google Calendar
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 180); // 6 months

    const events = await this.googleCalendar.getEvents(
      validTokens.access_token,
      now.toISOString(),
      futureDate.toISOString()
    );

    // Import events into our system (mark them as synced from external)
    for (const event of events) {
      try {
        await this.appointmentsService.createAppointment(companyId, {
          scheduled_start: new Date(event.start).getTime(),
          scheduled_end: new Date(event.end).getTime(),
          contact_name: event.summary || 'External Event',
          service_type: 'Synced from Google Calendar',
          notes: event.description,
          created_by: 'USER',
        } as any);
      } catch (err) {
        console.error('Error importing event:', err);
      }
    }
  }

  private async syncMicrosoftCalendar(companyId: string, company: any): Promise<void> {
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);

    // Refresh token if needed
    const validTokens = await this.microsoftCalendar.ensureValidTokens(tokens);
    if (validTokens !== tokens) {
      await this.companiesService.updateCompany(companyId, {
        calendar_connection: await this.encryptCalendarConnection({ ...tokens, ...validTokens }),
      });
    }

    // Pull events from Microsoft Calendar
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 180); // 6 months

    const events = await this.microsoftCalendar.getEvents(
      validTokens.access_token,
      now.toISOString(),
      futureDate.toISOString()
    );

    // Import events into our system
    for (const event of events) {
      try {
        await this.appointmentsService.createAppointment(companyId, {
          scheduled_start: new Date(event.start).getTime(),
          scheduled_end: new Date(event.end).getTime(),
          contact_name: event.summary || 'External Event',
          service_type: 'Synced from Microsoft Calendar',
          notes: event.description,
          created_by: 'USER',
        } as any);
      } catch (err) {
        console.error('Error importing event:', err);
      }
    }
  }

  async getConnectionStatus(companyId: string) {
    const company = await this.companiesService.findById(companyId);

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // If no external calendar is connected, return disconnected status
    if (company.calendar_mode !== 'EXTERNAL' || !company.calendar_connection) {
      return {
        connected: false,
        provider: null,
        connectedAt: null,
      };
    }

    // Verify the connection is still valid by testing the access token
    try {
      await this.verifyConnection(companyId, company);
      
      return {
        connected: true,
        provider: company.calendar_provider || null,
        connectedAt: company.calendar_connection?.connected_at || null,
      };
    } catch (error: any) {
      // Connection is invalid (permissions revoked, token expired, etc.)
      console.warn(`[CalendarIntegrationService] Connection verification failed for company ${companyId}:`, error.message);
      
      // Auto-disconnect the invalid connection
      await this.disconnectCalendar(companyId);
      
      return {
        connected: false,
        provider: null,
        connectedAt: null,
      };
    }
  }

  private async verifyConnection(companyId: string, company: any): Promise<void> {
    const provider = company.calendar_provider;
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);

    if (!tokens || !provider) {
      throw new Error('No calendar connection to verify');
    }

    try {
      if (provider === 'GOOGLE') {
        // Try to refresh/validate the token - this will fail if permissions are revoked
        const validTokens = await this.googleCalendar.ensureValidTokens(tokens);
        // If we get here, token is valid - test by making a minimal API call
        await this.googleCalendar.getEvents(
          validTokens.access_token,
          new Date().toISOString(),
          new Date(Date.now() + 86400000).toISOString() // Next 24 hours
        );
      } else if (provider === 'MICROSOFT') {
        // Try to refresh/validate the token - this will fail if permissions are revoked
        const validTokens = await this.microsoftCalendar.ensureValidTokens(tokens);
        // If we get here, token is valid - test by making a minimal API call
        await this.microsoftCalendar.getEvents(
          validTokens.access_token,
          new Date().toISOString(),
          new Date(Date.now() + 86400000).toISOString() // Next 24 hours
        );
      } else if (provider === 'APPLE') {
        // For Apple, test the connection directly
        const email = tokens.email;
        const appSpecificPassword = tokens.app_specific_password;
        if (!email || !appSpecificPassword) {
          throw new Error('Apple Calendar credentials missing');
        }
        const isValid = await this.appleCalendar.testConnection(email, appSpecificPassword);
        if (!isValid) {
          throw new Error('Apple Calendar connection test failed');
        }
      }
    } catch (error: any) {
      // Check if it's an authentication/authorization error (permissions revoked)
      const errorMessage = error.message?.toLowerCase() || '';
      const errorResponse = error.response?.data || {};
      const statusCode = error.response?.status;
      
      // Common indicators of revoked permissions:
      // - 401 Unauthorized
      // - 403 Forbidden
      // - "invalid_grant" (OAuth token revoked)
      // - "invalid_token" (token invalid)
      // - "insufficient_privileges" (permissions revoked)
      if (
        statusCode === 401 ||
        statusCode === 403 ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('invalid_token') ||
        errorMessage.includes('insufficient_privileges') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden') ||
        errorResponse.error === 'invalid_grant' ||
        errorResponse.error === 'invalid_token'
      ) {
        console.warn(`[CalendarIntegrationService] Permissions appear to be revoked for ${provider} calendar`);
        throw new Error('Calendar permissions revoked');
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async disconnectCalendar(companyId: string): Promise<void> {
    console.log(`[CalendarIntegrationService] Disconnecting calendar for company: ${companyId}`);

    // Delete all synced appointments from external calendar
    try {
      console.log(`[CalendarIntegrationService] Deleting synced appointments...`);
      const appointments = await this.appointmentsService.listAppointments(companyId, { limit: 1000 });

      // Filter appointments that were synced from external calendars
      const syncedAppointments = (appointments.appointments || []).filter((appt: any) => {
        const serviceType = appt.service_type || '';
        return (
          serviceType.includes('Synced from Google Calendar') ||
          serviceType.includes('Synced from Microsoft Calendar') ||
          serviceType.includes('Synced from Apple Calendar')
        );
      });

      console.log(`[CalendarIntegrationService] Found ${syncedAppointments.length} synced appointments to delete`);

      // Delete each synced appointment
      for (const appt of syncedAppointments) {
        try {
          await this.appointmentsService.deleteAppointment(companyId, appt.appointment_id);
        } catch (err) {
          console.error(`[CalendarIntegrationService] Error deleting synced appointment ${appt.appointment_id}:`, err);
          // Continue deleting other appointments even if one fails
        }
      }

      console.log(`[CalendarIntegrationService] Deleted ${syncedAppointments.length} synced appointments`);
    } catch (err) {
      console.error(`[CalendarIntegrationService] Error deleting synced appointments:`, err);
      // Continue with disconnection even if deletion fails
    }

    // Update company settings to disconnect calendar
    await this.companiesService.updateCompany(companyId, {
      calendar_provider: 'NONE',
      calendar_mode: 'INTERNAL',
      calendar_connection: null,
      calendar_setup_completed: false, // Reset setup so user sees setup screen again
    });
    console.log(`[CalendarIntegrationService] Calendar disconnected and setup reset for company: ${companyId}`);
  }

  async pushEventToExternalCalendar(companyId: string, appointment: any): Promise<any> {
    const company = await this.companiesService.findById(companyId);

    if (!company || !company.calendar_connection || company.calendar_mode !== 'EXTERNAL') {
      return null; // No external calendar connected, skip push
    }

    const provider = company.calendar_provider;
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);

    try {
      let externalEventId: string | null = null;

      if (provider === 'GOOGLE') {
        const validTokens = await this.googleCalendar.ensureValidTokens(tokens);
        const result = await this.googleCalendar.createEvent(validTokens.access_token, {
          summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
          description: appointment.notes,
          start: new Date(appointment.scheduled_start).toISOString(),
          end: new Date(appointment.scheduled_end).toISOString(),
        });
        externalEventId = result?.id || null;
      } else if (provider === 'MICROSOFT') {
        const validTokens = await this.microsoftCalendar.ensureValidTokens(tokens);
        const result = await this.microsoftCalendar.createEvent(validTokens.access_token, {
          summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
          description: appointment.notes,
          start: new Date(appointment.scheduled_start).toISOString(),
          end: new Date(appointment.scheduled_end).toISOString(),
        });
        externalEventId = result?.id || null;
      } else if (provider === 'APPLE') {
        const email = tokens.email || company.calendar_connection?.email;
        const appSpecificPassword = tokens.app_specific_password || company.calendar_connection?.app_specific_password;
        const calendarPath = tokens.calendar_path || '/calendars/';
        if (email && appSpecificPassword) {
          const result = await this.appleCalendar.createEvent(email, appSpecificPassword, calendarPath, {
            summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
            description: appointment.notes,
            start: new Date(appointment.scheduled_start).toISOString(),
            end: new Date(appointment.scheduled_end).toISOString(),
          });
          externalEventId = result?.id || null;
        }
      }

      return { externalEventId };
    } catch (err) {
      console.error('Error pushing event to external calendar:', err);
      // Don't fail the appointment creation if external push fails
      return null;
    }
  }

  async updateEventInExternalCalendar(companyId: string, appointment: any): Promise<void> {
    const company = await this.companiesService.findById(companyId);

    if (!company || !company.calendar_connection || company.calendar_mode !== 'EXTERNAL') {
      return; // No external calendar connected, skip update
    }

    const provider = company.calendar_provider;
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);
    const externalEventId = appointment.external_event_id;

    // If no external event ID, try to create instead
    if (!externalEventId) {
      await this.pushEventToExternalCalendar(companyId, appointment);
      return;
    }

    try {
      if (provider === 'GOOGLE') {
        const validTokens = await this.googleCalendar.ensureValidTokens(tokens);
        await this.googleCalendar.updateEvent(validTokens.access_token, externalEventId, {
          summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
          description: appointment.notes,
          start: new Date(appointment.scheduled_start).toISOString(),
          end: new Date(appointment.scheduled_end).toISOString(),
        });
      } else if (provider === 'MICROSOFT') {
        const validTokens = await this.microsoftCalendar.ensureValidTokens(tokens);
        await this.microsoftCalendar.updateEvent(validTokens.access_token, externalEventId, {
          summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
          description: appointment.notes,
          start: new Date(appointment.scheduled_start).toISOString(),
          end: new Date(appointment.scheduled_end).toISOString(),
        });
      } else if (provider === 'APPLE') {
        const email = tokens.email || company.calendar_connection?.email;
        const appSpecificPassword = tokens.app_specific_password || company.calendar_connection?.app_specific_password;
        const calendarPath = tokens.calendar_path || '/calendars/';
        if (email && appSpecificPassword) {
          await this.appleCalendar.updateEvent(email, appSpecificPassword, calendarPath, externalEventId, {
            summary: `${appointment.contact_name || 'Appointment'} - ${appointment.service_type}`,
            description: appointment.notes,
            start: new Date(appointment.scheduled_start).toISOString(),
            end: new Date(appointment.scheduled_end).toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('Error updating event in external calendar:', err);
      // Don't fail the appointment update if external sync fails
    }
  }

  async deleteEventFromExternalCalendar(companyId: string, appointment: any): Promise<void> {
    const company = await this.companiesService.findById(companyId);

    if (!company || !company.calendar_connection || company.calendar_mode !== 'EXTERNAL') {
      return; // No external calendar connected, skip delete
    }

    const provider = company.calendar_provider;
    const tokens = await this.decryptCalendarConnection(company.calendar_connection);
    const externalEventId = appointment.external_event_id;

    // If no external event ID, nothing to delete
    if (!externalEventId) {
      return;
    }

    try {
      if (provider === 'GOOGLE') {
        const validTokens = await this.googleCalendar.ensureValidTokens(tokens);
        await this.googleCalendar.deleteEvent(validTokens.access_token, externalEventId);
      } else if (provider === 'MICROSOFT') {
        const validTokens = await this.microsoftCalendar.ensureValidTokens(tokens);
        await this.microsoftCalendar.deleteEvent(validTokens.access_token, externalEventId);
      } else if (provider === 'APPLE') {
        const email = tokens.email || company.calendar_connection?.email;
        const appSpecificPassword = tokens.app_specific_password || company.calendar_connection?.app_specific_password;
        const calendarPath = tokens.calendar_path || '/calendars/';
        if (email && appSpecificPassword) {
          await this.appleCalendar.deleteEvent(email, appSpecificPassword, calendarPath, externalEventId);
        }
      }
    } catch (err) {
      console.error('Error deleting event from external calendar:', err);
      // Don't fail the appointment delete if external sync fails
    }
  }

  async connectAppleCalendar(companyId: string, email: string, appSpecificPassword: string, calendarPath?: string): Promise<void> {
    console.log(`[CalendarIntegrationService] Connecting Apple Calendar for company ${companyId}, email: ${email}`);

    try {
      // Test connection first with user's credentials
      // This will throw an error with a detailed message if credentials are invalid
      await this.appleCalendar.testConnection(email, appSpecificPassword);
      console.log(`[CalendarIntegrationService] Apple Calendar connection test passed`);

      // Get default calendar if not provided
      if (!calendarPath) {
        console.log(`[CalendarIntegrationService] Fetching available calendars...`);
        const calendars = await this.appleCalendar.getCalendars(email, appSpecificPassword);
        calendarPath = calendars[0]?.path || '/calendars/';
        console.log(`[CalendarIntegrationService] Using calendar path: ${calendarPath}`);
      }

      // Save the connection
      console.log(`[CalendarIntegrationService] Saving Apple Calendar connection to database...`);
      await this.companiesService.updateCompany(companyId, {
        calendar_provider: 'APPLE',
        calendar_mode: 'EXTERNAL',
        calendar_connection: await this.encryptCalendarConnection({
          provider: 'APPLE',
          email: email,
          app_specific_password: appSpecificPassword, // Store user's password securely
          calendar_path: calendarPath,
          connected_at: Date.now(),
        }),
        calendar_setup_completed: true,
      });

      console.log(`[CalendarIntegrationService] Apple Calendar connection saved successfully`);

      // Initial sync (don't fail if sync fails - connection is still successful)
      try {
        console.log(`[CalendarIntegrationService] Starting initial calendar sync...`);
        await this.syncCalendar(companyId);
        console.log(`[CalendarIntegrationService] Initial sync completed`);
      } catch (syncError: any) {
        console.warn(`[CalendarIntegrationService] Initial sync failed (non-critical):`, syncError.message);
        // Don't throw - connection is still successful even if sync fails
      }
    } catch (error: any) {
      console.error(`[CalendarIntegrationService] Failed to connect Apple Calendar:`, error.message);
      // Re-throw with the original error message (which is already detailed)
      throw new BadRequestException(error.message);
    }
  }

  private async syncAppleCalendar(companyId: string, company: any): Promise<void> {
    const connection = await this.decryptCalendarConnection(company.calendar_connection);
    const email = connection.email;
    const appSpecificPassword = connection.app_specific_password;
    const calendarPath = connection.calendar_path || '/calendars/';

    if (!email || !appSpecificPassword) {
      throw new BadRequestException('Apple Calendar email and app-specific password not configured');
    }

    // Pull events from Apple Calendar
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 180); // 6 months

    const events = await this.appleCalendar.getEvents(
      email,
      appSpecificPassword,
      calendarPath,
      now.toISOString(),
      futureDate.toISOString()
    );

    // Import events into our system
    for (const event of events) {
      try {
        await this.appointmentsService.createAppointment(companyId, {
          scheduled_start: new Date(event.start).getTime(),
          scheduled_end: new Date(event.end).getTime(),
          contact_name: event.summary || 'External Event',
          service_type: 'Synced from Apple Calendar',
          notes: event.description,
          created_by: 'USER',
        } as any);
      } catch (err) {
        console.error('Error importing event:', err);
      }
    }
  }

  private async encryptCalendarConnection(connection: any): Promise<any> {
    if (!connection || typeof connection !== 'object') return connection;
    const output = { ...connection };
    for (const field of this.sensitiveCalendarFields) {
      if (typeof output[field] === 'string') {
        output[field] = await this.encryptString(output[field]);
      }
    }
    return output;
  }

  private async decryptCalendarConnection(connection: any): Promise<any> {
    if (!connection || typeof connection !== 'object') return connection;
    const output = { ...connection };
    for (const field of this.sensitiveCalendarFields) {
      if (typeof output[field] === 'string') {
        output[field] = await this.decryptString(output[field]);
      }
    }
    return output;
  }

  private async encryptString(value: string): Promise<string> {
    if (!value || !this.kms || !this.kmsKeyId) return value;
    if (value.startsWith(this.kmsPrefix)) return value;

    const response = await this.kms.send(
      new EncryptCommand({
        KeyId: this.kmsKeyId,
        Plaintext: Buffer.from(value, 'utf8'),
      })
    );
    if (!response.CiphertextBlob) return value;
    return `${this.kmsPrefix}${Buffer.from(response.CiphertextBlob).toString('base64')}`;
  }

  private async decryptString(value: string): Promise<string> {
    if (!value || !this.kms) return value;
    if (!value.startsWith(this.kmsPrefix)) return value;

    const encoded = value.slice(this.kmsPrefix.length);
    const response = await this.kms.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(encoded, 'base64'),
      })
    );
    if (!response.Plaintext) return value;
    return Buffer.from(response.Plaintext).toString('utf8');
  }
}

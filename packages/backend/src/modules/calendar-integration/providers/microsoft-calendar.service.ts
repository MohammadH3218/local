import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { ParameterStoreService } from '../../../infrastructure/config/parameter-store.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MicrosoftCalendarService implements OnModuleInit {
  private clientId: string = '';
  private clientSecret: string = '';
  private redirectUri: string = '';
  private authority = 'https://login.microsoftonline.com/common';
  private tokenEndpoint = `${this.authority}/oauth2/v2.0/token`;
  private authEndpoint = `${this.authority}/oauth2/v2.0/authorize`;
  private graphEndpoint = 'https://graph.microsoft.com/v1.0';

  constructor(
    private parameterStore: ParameterStoreService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Pre-load credentials if available
    await this.ensureCredentials();
  }

  private async ensureCredentials(): Promise<void> {
    // Load credentials from Parameter Store or env vars
    this.clientId = (await this.parameterStore.getMicrosoftClientId()) || '';
    this.clientSecret = (await this.parameterStore.getMicrosoftClientSecret()) || '';
    this.redirectUri = (await this.parameterStore.getMicrosoftRedirectUri()) || '';

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      console.warn('[MicrosoftCalendarService] OAuth credentials not fully configured. Calendar integration may not work.');
      console.warn(`[MicrosoftCalendarService] clientId: ${this.clientId ? 'SET' : 'MISSING'}, clientSecret: ${this.clientSecret ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`);
    }
  }

  async getAuthUrl(companyId: string): Promise<string> {
    // Ensure credentials are loaded before generating URL
    await this.ensureCredentials();
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Microsoft OAuth credentials not configured. Please check Parameter Store or environment variables.');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'Calendars.ReadWrite offline_access',
      state: companyId,
    });

    return `${this.authEndpoint}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    // Ensure credentials are loaded
    await this.ensureCredentials();
    
    console.log(`[MicrosoftCalendarService] Exchanging code for tokens - clientId: ${this.clientId ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`);
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      const error = 'Microsoft OAuth credentials not configured';
      console.error(`[MicrosoftCalendarService] ${error} - clientId: ${this.clientId ? 'SET' : 'MISSING'}, clientSecret: ${this.clientSecret ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`);
      throw new Error(error);
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    try {
      console.log(`[MicrosoftCalendarService] Requesting token from: ${this.tokenEndpoint}`);
      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.data.access_token) {
        console.error(`[MicrosoftCalendarService] Token exchange response missing access_token:`, response.data);
        throw new Error('Token exchange failed: no access_token in response');
      }

      console.log(`[MicrosoftCalendarService] Token exchange successful - expires_in: ${response.data.expires_in}s`);
      
      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expiry_date: Date.now() + (response.data.expires_in * 1000),
      };
    } catch (error: any) {
      console.error(`[MicrosoftCalendarService] Token exchange failed:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
      throw new Error(`Failed to exchange authorization code: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async ensureValidTokens(tokens: any): Promise<any> {
    // Ensure credentials are loaded
    await this.ensureCredentials();
    
    // Check if token is expired
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      // Refresh the token
      try {
        const params = new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        });

        const response = await axios.post(this.tokenEndpoint, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        return {
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token || tokens.refresh_token,
          expiry_date: Date.now() + response.data.expires_in * 1000,
        };
      } catch (error: any) {
        // If refresh fails, it likely means permissions were revoked
        const errorMessage = error.response?.data?.error || error.message || '';
        const errorDescription = error.response?.data?.error_description || '';
        
        console.error(`[MicrosoftCalendarService] Token refresh failed:`, {
          error: errorMessage,
          description: errorDescription,
          status: error.response?.status,
        });
        
        // Re-throw with clear message for revoked permissions
        if (
          errorMessage === 'invalid_grant' ||
          errorMessage === 'invalid_token' ||
          error.response?.status === 401 ||
          error.response?.status === 403
        ) {
          throw new Error('Calendar permissions revoked - token refresh failed');
        }
        
        throw error;
      }
    }

    return tokens;
  }

  async getEvents(accessToken: string, startDateTime: string, endDateTime: string): Promise<any[]> {
    try {
      const response = await axios.get(`${this.graphEndpoint}/me/calendar/calendarView`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          startDateTime,
          endDateTime,
          $top: 250,
          $orderby: 'start/dateTime',
        },
      });

      return (response.data.value || []).map((event: any) => ({
        id: event.id,
        summary: event.subject,
        description: event.bodyPreview,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
      }));
    } catch (err: any) {
      // Re-throw authentication/authorization errors so they can be handled upstream
      if (err.response?.status === 401 || err.response?.status === 403) {
        console.error(`[MicrosoftCalendarService] Unauthorized/Forbidden when fetching events:`, {
          status: err.response?.status,
          error: err.response?.data,
        });
        throw new Error('Calendar permissions revoked or token invalid');
      }
      console.error('Error fetching Microsoft Calendar events:', err);
      return [];
    }
  }

  async createEvent(accessToken: string, event: any): Promise<any> {
    const response = await axios.post(
      `${this.graphEndpoint}/me/calendar/events`,
      {
        subject: event.summary,
        body: {
          contentType: 'Text',
          content: event.description || '',
        },
        start: {
          dateTime: event.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  async updateEvent(accessToken: string, eventId: string, event: any): Promise<any> {
    const response = await axios.patch(
      `${this.graphEndpoint}/me/calendar/events/${eventId}`,
      {
        subject: event.summary,
        body: {
          contentType: 'Text',
          content: event.description || '',
        },
        start: {
          dateTime: event.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  async getMailboxTimeZone(accessToken: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.graphEndpoint}/me/mailboxSettings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data?.timeZone || null;
    } catch (error: any) {
      console.warn('[MicrosoftCalendarService] Failed to fetch mailbox timezone', error?.message || error);
      return null;
    }
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    await axios.delete(`${this.graphEndpoint}/me/calendar/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async getOAuthConfig(): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
    await this.ensureCredentials();
    return {
      clientId: this.clientId || '',
      clientSecret: this.clientSecret || '',
      redirectUri: this.redirectUri || '',
    };
  }
}

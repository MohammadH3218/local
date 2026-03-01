import { Injectable, OnModuleInit } from '@nestjs/common';
import { google } from 'googleapis';
import { ParameterStoreService } from '../../../infrastructure/config/parameter-store.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleCalendarService implements OnModuleInit {
  private oauth2Client: any;
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  private redirectUri: string | null = null;

  constructor(
    private parameterStore: ParameterStoreService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Pre-load credentials if available, but we'll reload them on each request to ensure they're fresh
    await this.ensureOAuthClient();
  }

  private async ensureOAuthClient(): Promise<void> {
    // Load credentials from Parameter Store or env vars
    const clientId = await this.parameterStore.getGoogleClientId();
    const clientSecret = await this.parameterStore.getGoogleClientSecret();
    const redirectUri = await this.parameterStore.getGoogleRedirectUri();

    // Update instance variables
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    console.log(`[GoogleCalendarService] Loaded credentials - clientId: ${this.clientId ? 'SET (' + this.clientId.substring(0, 20) + '...)' : 'MISSING'}, clientSecret: ${this.clientSecret ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`);

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      const msg = `[GoogleCalendarService] OAuth credentials not fully configured. clientId: ${this.clientId ? 'SET' : 'MISSING'}, clientSecret: ${this.clientSecret ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`;
      console.error(msg);
      // Don't create client with empty strings - it will fail silently
      return;
    }

    // Recreate OAuth client with current credentials
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // Verify client was created correctly
    if (!this.oauth2Client._clientId) {
      console.error('[GoogleCalendarService] Failed to create OAuth client - clientId not set');
    }

    // Verify redirect URI is set in the client
    if (!this.oauth2Client._redirectUri) {
      console.error(`[GoogleCalendarService] OAuth client missing redirectUri. Provided: ${this.redirectUri}`);
    } else {
      console.log(`[GoogleCalendarService] OAuth client initialized with redirectUri: ${this.oauth2Client._redirectUri}`);
    }
  }

  async getAuthUrl(companyId: string): Promise<string> {
    // Always reload credentials to ensure they're fresh
    await this.ensureOAuthClient();
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      const errorMsg = `Google OAuth credentials not configured. clientId: ${this.clientId ? 'SET' : 'MISSING'}, clientSecret: ${this.clientSecret ? 'SET' : 'MISSING'}, redirectUri: ${this.redirectUri || 'MISSING'}`;
      console.error(`[GoogleCalendarService] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Always create a fresh OAuth client to ensure credentials are current
    // This is critical - don't reuse a client that might have been created with empty strings
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // Verify the client has credentials before generating URL
    // The googleapis library stores credentials in _clientId and _clientSecret
    if (!oauth2Client._clientId) {
      console.error(`[GoogleCalendarService] OAuth client missing clientId. Provided: ${this.clientId ? 'YES' : 'NO'}`);
      throw new Error('OAuth client failed to initialize with credentials - clientId is missing');
    }

    if (!oauth2Client._clientSecret) {
      console.error(`[GoogleCalendarService] OAuth client missing clientSecret. Provided: ${this.clientSecret ? 'YES' : 'NO'}`);
      throw new Error('OAuth client failed to initialize with credentials - clientSecret is missing');
    }

    console.log(`[GoogleCalendarService] Generating auth URL with clientId: ${this.clientId.substring(0, 20)}..., redirectUri: ${this.redirectUri}`);

    // Verify redirectUri is set
    if (!this.redirectUri || this.redirectUri.trim() === '') {
      throw new Error('redirect_uri is required but was not provided. Please check Parameter Store or environment variables.');
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: companyId, // Pass companyId as state
      prompt: 'consent', // Force consent screen to get refresh token
      redirect_uri: this.redirectUri, // Explicitly set redirect_uri
    });

    // Store the client for token exchange
    this.oauth2Client = oauth2Client;

    console.log(`[GoogleCalendarService] Generated auth URL: ${authUrl.substring(0, 100)}...`);
    return authUrl;
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    // Ensure credentials are loaded and client is initialized
    await this.ensureOAuthClient();
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('OAuth credentials not configured');
    }

    // Ensure OAuth client is initialized with credentials
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
    }
    
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async ensureValidTokens(tokens: any): Promise<any> {
    // Ensure OAuth client is initialized before using it
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }

    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    this.oauth2Client.setCredentials(tokens);

    // Check if token is expired
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      // Refresh the token
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        return credentials;
      } catch (error: any) {
        // If refresh fails, it likely means permissions were revoked
        console.error(`[GoogleCalendarService] Token refresh failed:`, {
          error: error.message,
          code: error.code,
        });
        
        // Re-throw with clear message for revoked permissions
        if (
          error.message?.includes('invalid_grant') ||
          error.message?.includes('invalid_token') ||
          error.code === 'invalid_grant'
        ) {
          throw new Error('Calendar permissions revoked - token refresh failed');
        }
        
        throw error;
      }
    }

    return tokens;
  }

  async getEvents(accessToken: string, timeMin: string, timeMax: string): Promise<any[]> {
    // Ensure OAuth client is initialized
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }
    
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        maxResults: 250,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (response.data.items || []).map((event: any) => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
      }));
    } catch (err: any) {
      // Re-throw authentication/authorization errors so they can be handled upstream
      if (err.code === 401 || err.code === 403) {
        console.error(`[GoogleCalendarService] Unauthorized/Forbidden when fetching events:`, {
          code: err.code,
          message: err.message,
        });
        throw new Error('Calendar permissions revoked or token invalid');
      }
      console.error('Error fetching Google Calendar events:', err);
      return [];
    }
  }

  async createEvent(accessToken: string, event: any): Promise<any> {
    // Ensure OAuth client is initialized
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }
    
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC',
        },
      },
    });

    return response.data;
  }

  async getPrimaryTimeZone(accessToken: string): Promise<string | null> {
    // Ensure OAuth client is initialized
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }

    if (!this.oauth2Client) return null;

    this.oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    try {
      const response = await calendar.calendars.get({ calendarId: 'primary' });
      return response.data.timeZone || null;
    } catch (err: any) {
      console.warn('[GoogleCalendarService] Failed to fetch calendar timezone', err?.message || err);
      return null;
    }
  }

  async updateEvent(accessToken: string, eventId: string, event: any): Promise<any> {
    // Ensure OAuth client is initialized
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }
    
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC',
        },
      },
    });

    return response.data;
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    // Ensure OAuth client is initialized
    if (!this.oauth2Client || !this.oauth2Client._clientId) {
      await this.ensureOAuthClient();
    }

    this.oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
  }

  async getOAuthConfig(): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
    await this.ensureOAuthClient();
    return {
      clientId: this.clientId || '',
      clientSecret: this.clientSecret || '',
      redirectUri: this.redirectUri || '',
    };
  }
}

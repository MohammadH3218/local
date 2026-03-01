import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';

@Injectable()
export class ParameterStoreService implements OnModuleInit {
  private ssmClient: SSMClient;
  private cache: Map<string, string> = new Map();
  private useParameterStore: boolean;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.useParameterStore = this.configService.get<string>('USE_PARAMETER_STORE') === 'true';
    
    if (this.useParameterStore) {
      const endpoint =
        this.configService.get<string>('SSM_ENDPOINT') ||
        this.configService.get<string>('AWS_ENDPOINT_URL_SSM') ||
        this.configService.get<string>('AWS_LOCALSTACK_ENDPOINT');
      this.ssmClient = new SSMClient({
        region,
        ...(endpoint ? { endpoint } : {}),
      });
    }
  }

  async onModuleInit() {
    // Pre-load OAuth credentials if using Parameter Store
    if (this.useParameterStore) {
      await this.loadOAuthCredentials();
    }
  }

  private async loadOAuthCredentials() {
    try {
      const parameterNames = [
        '/handycall/oauth/google/client-id',
        '/handycall/oauth/google/client-secret',
        '/handycall/oauth/google/redirect-uri',
        '/handycall/oauth/microsoft/client-id',
        '/handycall/oauth/microsoft/client-secret',
        '/handycall/oauth/microsoft/redirect-uri',
        '/handycall/oauth/microsoft/tenant-id',
        '/handycall/api/openai-key',
      ];

      const command = new GetParametersCommand({
        Names: parameterNames,
        WithDecryption: true,
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameters) {
        const loaded: string[] = [];
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            this.cache.set(param.Name, param.Value);
            loaded.push(param.Name);
          }
        }
        console.log(`[ParameterStoreService] Loaded ${loaded.length} OAuth credentials from Parameter Store:`, loaded);
      } else {
        console.warn('[ParameterStoreService] No OAuth credentials found in Parameter Store');
      }

      // Log which credentials are missing
      const missing = parameterNames.filter(name => !this.cache.has(name));
      if (missing.length > 0) {
        console.warn(`[ParameterStoreService] Missing credentials: ${missing.join(', ')}`);
      }
    } catch (error) {
      console.error('[ParameterStoreService] Error loading credentials from Parameter Store:', error);
      // Fall back to environment variables
    }
  }

  async getParameter(name: string, decrypt: boolean = true): Promise<string | null> {
    // If not using Parameter Store, return null to fall back to env vars
    if (!this.useParameterStore) {
      return null;
    }

    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name) || null;
    }

    try {
      const command = new GetParameterCommand({
        Name: name,
        WithDecryption: decrypt,
      });

      const response = await this.ssmClient.send(command);
      const value = response.Parameter?.Value || null;

      if (value) {
        this.cache.set(name, value);
      }

      return value;
    } catch (error) {
      console.error(`[ParameterStoreService] Error fetching parameter ${name}:`, error);
      return null;
    }
  }

  getCachedParameter(name: string): string | null {
    return this.cache.get(name) || null;
  }

  // Helper methods for OAuth credentials
  async getGoogleClientId(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/google/client-id') ||
           this.configService.get<string>('GOOGLE_CLIENT_ID') || null;
  }

  async getGoogleClientSecret(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/google/client-secret') ||
           this.configService.get<string>('GOOGLE_CLIENT_SECRET') || null;
  }

  async getGoogleRedirectUri(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/google/redirect-uri', false) ||
           this.configService.get<string>('GOOGLE_REDIRECT_URI') ||
           `${this.configService.get<string>('BACKEND_URL')}/calendar-integration/auth/google/callback` || null;
  }

  async getMicrosoftClientId(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/microsoft/client-id') ||
           this.configService.get<string>('MICROSOFT_CLIENT_ID') || null;
  }

  async getMicrosoftClientSecret(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/microsoft/client-secret') ||
           this.configService.get<string>('MICROSOFT_CLIENT_SECRET') || null;
  }

  async getMicrosoftRedirectUri(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/microsoft/redirect-uri', false) ||
           this.configService.get<string>('MICROSOFT_REDIRECT_URI') ||
           `${this.configService.get<string>('BACKEND_URL')}/calendar-integration/auth/microsoft/callback` || null;
  }

  async getAppleAppSpecificPassword(): Promise<string | null> {
    return this.getParameter('/handycall/oauth/apple/app-specific-password', true) ||
           this.configService.get<string>('APPLE_APP_SPECIFIC_PASSWORD') || null;
  }

  async getOpenAIApiKey(): Promise<string | null> {
    return (await this.getParameter('/handycall/api/openai-key')) ||
           this.configService.get<string>('OPENAI_API_KEY') || null;
  }
}

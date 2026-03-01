import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ListUsersCommand,
  AuthFlowType,
  ChallengeNameType,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHmac } from 'crypto';

export interface CognitoLoginResult {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  challengeName?: string;
  session?: string;
  userAttributes?: Record<string, string>;
  poolType?: 'users' | 'admin' | 'customer'; // Track which pool was used
}

@Injectable()
export class CognitoService {
  private cognitoClient: CognitoIdentityProviderClient;
  private usersPoolId: string;
  private usersClientId: string;
  private usersClientSecret: string;
  private adminPoolId: string;
  private adminClientId: string;
  private adminClientSecret: string;
  private customerPoolId: string;
  private customerClientId: string;
  private customerClientSecret: string;

  constructor(private configService: ConfigService) {
    const region =
      this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('AWS_DEFAULT_REGION') ||
      'us-east-1';
    this.cognitoClient = new CognitoIdentityProviderClient({ region });

    this.usersPoolId = this.configService.get<string>('AWS_COGNITO_USERS_POOL_ID')!;
    this.usersClientId = this.configService.get<string>('AWS_COGNITO_USERS_CLIENT_ID')!;
    this.usersClientSecret = this.configService.get<string>('AWS_COGNITO_USERS_CLIENT_SECRET')!;
    
    // Admin pool credentials (optional - may not be set in all environments)
    this.adminPoolId = this.configService.get<string>('AWS_COGNITO_ADMIN_POOL_ID') || '';
    this.adminClientId = this.configService.get<string>('AWS_COGNITO_ADMIN_CLIENT_ID') || '';
    this.adminClientSecret = this.configService.get<string>('AWS_COGNITO_ADMIN_CLIENT_SECRET') || '';

    this.customerPoolId =
      this.configService.get<string>('AWS_COGNITO_CUSTOMER_POOL_ID') ||
      this.configService.get<string>('AWS_COGNITO_CUSTOMERS_POOL_ID') ||
      '';
    this.customerClientId =
      this.configService.get<string>('AWS_COGNITO_CUSTOMER_CLIENT_ID') ||
      this.configService.get<string>('AWS_COGNITO_CUSTOMERS_CLIENT_ID') ||
      '';
    this.customerClientSecret =
      this.configService.get<string>('AWS_COGNITO_CUSTOMER_CLIENT_SECRET') ||
      this.configService.get<string>('AWS_COGNITO_CUSTOMERS_CLIENT_SECRET') ||
      '';
  }

  private calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
    const message = username + clientId;
    const hmac = createHmac('sha256', clientSecret);
    hmac.update(message);
    return hmac.digest('base64');
  }

  private resolvePoolConfig(poolType: 'users' | 'admin' | 'customer') {
    if (poolType === 'admin') {
      return {
        poolId: this.adminPoolId,
        clientId: this.adminClientId,
        clientSecret: this.adminClientSecret,
      };
    }
    if (poolType === 'customer') {
      return {
        poolId: this.customerPoolId,
        clientId: this.customerClientId,
        clientSecret: this.customerClientSecret,
      };
    }
    return {
      poolId: this.usersPoolId,
      clientId: this.usersClientId,
      clientSecret: this.usersClientSecret,
    };
  }

  async login(
    email: string,
    password: string,
    poolType: 'auto' | 'users' | 'admin' | 'customer' = 'auto',
  ): Promise<CognitoLoginResult> {
    const poolsToTry: Array<'users' | 'admin' | 'customer'> =
      poolType === 'auto' ? ['users', 'customer', 'admin'] : [poolType];

    let lastError: any = null;

    for (const pool of poolsToTry) {
      try {
        const result = await this.loginWithPool(email, password, pool);
        return result;
      } catch (error: any) {
        lastError = error;
        const poolIndex = poolsToTry.indexOf(pool);
        const isLastPool = poolIndex === poolsToTry.length - 1;
        
        // If this is NotAuthorizedException and we have more pools to try, continue
        // Otherwise, let it fall through to handle after the loop
        if (error.name === 'UserNotConfirmedException') {
          throw new BadRequestException('Email not verified. Please verify your email before signing in.');
        }

        if (error.name === 'NotAuthorizedException' && !isLastPool) {
          continue;
        }

        // Auth flow not enabled on the app client (e.g. ADMIN_USER_PASSWORD_AUTH disabled in AWS console)
        if (error.name === 'InvalidParameterException') {
          console.error(`[CognitoService] Auth flow not enabled for pool "${pool}":`, error.message);
          throw new UnauthorizedException(
            'Authentication is not configured for this account type. Please contact support.',
          );
        }

        // Pool or client does not exist in AWS
        if (error.name === 'ResourceNotFoundException') {
          console.error(`[CognitoService] Pool or client not found for pool "${pool}":`, error.message);
          throw new UnauthorizedException('Authentication service unavailable. Please contact support.');
        }

        // For non-NotAuthorizedException errors, throw immediately
        // For NotAuthorizedException on the last pool, fall through to handle after loop
        if (error.name !== 'NotAuthorizedException' && error.name !== 'UserNotFoundException') {
          console.error(`[CognitoService] Unexpected auth error for pool "${pool}":`, error.name, error.message);
          throw new UnauthorizedException('Authentication failed. Please try again later.');
        }
      }
    }

    // If we get here, all pools failed
    if (lastError?.name === 'UserNotConfirmedException') {
      throw new BadRequestException('Email not verified. Please verify your email before signing in.');
    }

    if (lastError?.name === 'NotAuthorizedException' || lastError?.name === 'UserNotFoundException') {
      throw new UnauthorizedException('Invalid email or password');
    }
    throw lastError || new UnauthorizedException('Authentication failed');
  }

  private async loginWithPool(
    email: string,
    password: string,
    poolType: 'users' | 'admin' | 'customer',
  ): Promise<CognitoLoginResult> {
    const { poolId, clientId, clientSecret } = this.resolvePoolConfig(poolType);

    if (!poolId || !clientId || !clientSecret) {
      throw new UnauthorizedException(`Pool ${poolType} not configured`);
    }

    const secretHash = this.calculateSecretHash(email, clientId, clientSecret);

    const command = new AdminInitiateAuthCommand({
      UserPoolId: poolId,
      ClientId: clientId,
      AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    });

    const response = await this.cognitoClient.send(command);

    // Check if user needs to change password (first login with temp password)
    if (response.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED) {
      return {
        accessToken: '',
        idToken: '',
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: response.Session,
        userAttributes: {},
        poolType,
      };
    }

    if (!response.AuthenticationResult) {
      throw new UnauthorizedException('Authentication failed');
    }

    // Get user attributes from the correct pool
    const userAttributes = await this.getUserAttributes(email, poolType);

    return {
      accessToken: response.AuthenticationResult.AccessToken!,
      idToken: response.AuthenticationResult.IdToken!,
      refreshToken: response.AuthenticationResult.RefreshToken,
      userAttributes,
      poolType,
    };
  }

  async respondToNewPasswordChallenge(
    email: string,
    newPassword: string,
    session: string,
    poolType: 'users' | 'admin' | 'customer' = 'users'
  ): Promise<CognitoLoginResult> {
    const { poolId, clientId, clientSecret } = this.resolvePoolConfig(poolType);

    if (!poolId || !clientId || !clientSecret) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    const secretHash = this.calculateSecretHash(email, clientId, clientSecret);

    try {
      const command = new AdminRespondToAuthChallengeCommand({
        UserPoolId: poolId,
        ClientId: clientId,
        ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
        ChallengeResponses: {
          USERNAME: email,
          NEW_PASSWORD: newPassword,
          SECRET_HASH: secretHash,
        },
        Session: session,
      });

      const response = await this.cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new BadRequestException('Failed to set new password');
      }

      // Get user attributes from the correct pool
      const userAttributes = await this.getUserAttributes(email, poolType);

      return {
        accessToken: response.AuthenticationResult.AccessToken!,
        idToken: response.AuthenticationResult.IdToken!,
        refreshToken: response.AuthenticationResult.RefreshToken,
        userAttributes,
        poolType,
      };
    } catch (error: any) {
      console.error('[CognitoService] New password challenge error:', error);
      console.error('[CognitoService] Error details:', {
        name: error.name,
        message: error.message,
        code: error.$metadata?.httpStatusCode,
        poolType,
      });
      
      // Re-throw the original error to preserve error type and message
      if (error.name === 'NotAuthorizedException') {
        throw error; // Let AuthService handle this with better message
      }
      
      throw new BadRequestException(error.message || 'Failed to set new password');
    }
  }

  async userExists(email: string, poolType: 'users' | 'admin' | 'customer' = 'users'): Promise<boolean> {
    const { poolId } = this.resolvePoolConfig(poolType);
    if (!poolId) return false;

    try {
      await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: poolId,
          Username: email,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        return false;
      }
      // For other errors, bubble up so callers can decide
      throw error;
    }
  }

  async getUserAttributes(
    email: string,
    poolType: 'users' | 'admin' | 'customer' = 'users',
  ): Promise<Record<string, string>> {
    const { poolId } = this.resolvePoolConfig(poolType);
    
    if (!poolId) {
      console.warn(`[CognitoService] Pool ${poolType} not configured, cannot get user attributes`);
      return {};
    }

    try {
      const command = new AdminGetUserCommand({
        UserPoolId: poolId,
        Username: email,
      });

      const response = await this.cognitoClient.send(command);
      const attributes: Record<string, string> = {};

      response.UserAttributes?.forEach((attr) => {
        if (attr.Name && attr.Value) {
          attributes[attr.Name] = attr.Value;
        }
      });

      return attributes;
    } catch (error) {
      console.error(`[CognitoService] Failed to get user attributes from ${poolType} pool:`, error);
      return {};
    }
  }

  async updateUserAttributes(
    email: string,
    attributes: Record<string, string>,
    poolType: 'users' | 'admin' | 'customer' = 'users'
  ): Promise<void> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    try {
      const userAttributes = Object.entries(attributes).map(([key, value]) => ({
        Name: key,
        Value: value,
      }));

      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: poolId,
        Username: email,
        UserAttributes: userAttributes,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to update user attributes:', error);
      throw new BadRequestException(`Failed to update user attributes: ${error.message}`);
    }
  }

  async refreshAccessToken(
    refreshToken: string,
    username: string,
    poolType: 'auto' | 'users' | 'admin' | 'customer' = 'auto'
  ): Promise<{ accessToken: string; idToken: string; poolType: 'users' | 'admin' | 'customer' }> {
    const poolsToTry: Array<'users' | 'admin' | 'customer'> =
      poolType === 'auto' ? ['users', 'customer', 'admin'] : [poolType];
    let lastError: any = null;

    for (const pool of poolsToTry) {
      const { poolId, clientId, clientSecret } = this.resolvePoolConfig(pool);

      if (!poolId || !clientId || !clientSecret) {
        continue;
      }

      const secretHash = this.calculateSecretHash(username, clientId, clientSecret);

      try {
        const command = new AdminInitiateAuthCommand({
          UserPoolId: poolId,
          ClientId: clientId,
          AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
            SECRET_HASH: secretHash,
          },
        });

        const response = await this.cognitoClient.send(command);

        if (!response.AuthenticationResult?.AccessToken || !response.AuthenticationResult?.IdToken) {
          throw new UnauthorizedException('Token refresh failed');
        }

        return {
          accessToken: response.AuthenticationResult.AccessToken,
          idToken: response.AuthenticationResult.IdToken,
          poolType: pool,
        };
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new UnauthorizedException(lastError?.message || 'Invalid refresh token');
  }

  /**
   * Create a new user in Cognito user pool
   */
  async createUser(
    email: string,
    tempPassword: string,
    companyId?: string,
    name?: string,
    poolType: 'users' | 'admin' | 'customer' = 'users',
    options?: {
      makePasswordPermanent?: boolean;
    }
  ): Promise<void> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    // Default to NOT setting a permanent password so Cognito enforces NEW_PASSWORD_REQUIRED
    const makePasswordPermanent = options?.makePasswordPermanent ?? false;

    console.log('[CognitoService] Creating user:', {
      email,
      poolType,
      hasCompanyId: !!companyId,
      makePasswordPermanent,
    });

    try {
      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ];

      if (poolType === 'users' && companyId) {
        userAttributes.push({ Name: 'custom:company_id', Value: companyId });
      }

      if (name) {
        userAttributes.push({ Name: 'name', Value: name });
        const parts = name.split(' ');
        if (parts[0]) userAttributes.push({ Name: 'given_name', Value: parts[0] });
        if (parts.slice(1).join(' ')) {
          userAttributes.push({ Name: 'family_name', Value: parts.slice(1).join(' ') });
        }
      }

      const command = new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        UserAttributes: userAttributes,
        TemporaryPassword: tempPassword,
        MessageAction: MessageActionType.SUPPRESS, // Don't send welcome email
      });

      await this.cognitoClient.send(command);
      console.log('[CognitoService] User created in Cognito (FORCE_CHANGE_PASSWORD state)');

      // Set permanent password immediately (skip when we want a forced password change)
      if (makePasswordPermanent) {
        console.log('[CognitoService] Setting permanent password (user can login immediately)');
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: email,
          Password: tempPassword,
          Permanent: true,
        });

        await this.cognitoClient.send(setPasswordCommand);
      } else {
        console.log('[CognitoService] Password remains temporary (user must change on first login)');
      }
    } catch (error: any) {
      console.error('[CognitoService] Failed to create user:', error);
      throw new BadRequestException(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Sign up a user in the users pool (email verification required).
   */
  async signUpUser(
    email: string,
    password: string,
    attributes?: Record<string, string>,
    poolType: 'users' | 'customer' = 'users',
  ): Promise<void> {
    const { clientId, clientSecret } = this.resolvePoolConfig(poolType);
    if (!clientId || !clientSecret) {
      throw new BadRequestException(`${poolType} pool client not configured`);
    }

    const secretHash = this.calculateSecretHash(email, clientId, clientSecret);

    const userAttributes = [
      { Name: 'email', Value: email },
    ];

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === '') continue;
        userAttributes.push({ Name: key, Value: value });
      }
    }

    try {
      const command = new SignUpCommand({
        ClientId: clientId,
        Username: email,
        Password: password,
        SecretHash: secretHash,
        UserAttributes: userAttributes,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to sign up user:', error);
      throw new BadRequestException(error?.message || 'Failed to sign up user');
    }
  }

  /**
   * Confirm a user's sign-up using the emailed code.
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    return this.confirmSignUpForPool(email, code, 'users');
  }

  async confirmSignUpForPool(
    email: string,
    code: string,
    poolType: 'users' | 'customer' = 'users',
  ): Promise<void> {
    const { clientId, clientSecret } = this.resolvePoolConfig(poolType);
    if (!clientId || !clientSecret) {
      throw new BadRequestException(`${poolType} pool client not configured`);
    }

    const secretHash = this.calculateSecretHash(email, clientId, clientSecret);

    try {
      const command = new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: code,
        SecretHash: secretHash,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to confirm sign up:', error);
      throw new BadRequestException(error?.message || 'Failed to confirm sign up');
    }
  }

  /**
   * Resend the confirmation code email for sign-up.
   */
  async resendConfirmationCode(email: string): Promise<void> {
    return this.resendConfirmationCodeForPool(email, 'users');
  }

  async resendConfirmationCodeForPool(
    email: string,
    poolType: 'users' | 'customer' = 'users',
  ): Promise<void> {
    const { clientId, clientSecret } = this.resolvePoolConfig(poolType);
    if (!clientId || !clientSecret) {
      throw new BadRequestException(`${poolType} pool client not configured`);
    }

    const secretHash = this.calculateSecretHash(email, clientId, clientSecret);

    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: email,
        SecretHash: secretHash,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to resend confirmation code:', error);
      throw new BadRequestException(error?.message || 'Failed to resend confirmation code');
    }
  }

  /**
   * Delete a user from Cognito
   */
  async deleteUser(email: string, poolType: 'users' | 'admin' | 'customer' = 'users'): Promise<void> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    try {
      const command = new AdminDeleteUserCommand({
        UserPoolId: poolId,
        Username: email,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to delete user:', error);
      throw new BadRequestException(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Disable a user account
   */
  async disableUser(email: string, poolType: 'users' | 'admin' | 'customer' = 'users'): Promise<void> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    try {
      const command = new AdminDisableUserCommand({
        UserPoolId: poolId,
        Username: email,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to disable user:', error);
      throw new BadRequestException(`Failed to disable user: ${error.message}`);
    }
  }

  /**
   * Enable a user account
   */
  async enableUser(email: string, poolType: 'users' | 'admin' | 'customer' = 'users'): Promise<void> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    try {
      const command = new AdminEnableUserCommand({
        UserPoolId: poolId,
        Username: email,
      });

      await this.cognitoClient.send(command);
    } catch (error: any) {
      console.error('[CognitoService] Failed to enable user:', error);
      throw new BadRequestException(`Failed to enable user: ${error.message}`);
    }
  }

  async setUserPassword(
    email: string,
    newPassword: string,
    poolType: 'auto' | 'users' | 'admin' | 'customer' = 'auto'
  ): Promise<void> {
    const poolsToTry: Array<'users' | 'admin' | 'customer'> =
      poolType === 'auto' ? ['users', 'customer', 'admin'] : [poolType];
    let lastError: any = null;

    for (const pool of poolsToTry) {
      const { poolId } = this.resolvePoolConfig(pool);
      if (!poolId) {
        continue;
      }
      try {
        const command = new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: email,
          Password: newPassword,
          Permanent: true,
        });
        await this.cognitoClient.send(command);
        return;
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new BadRequestException(lastError?.message || 'Failed to set new password');
  }

  /**
   * List all users in a pool (with pagination)
   */
  async listUsers(poolType: 'users' | 'admin' | 'customer' = 'users', limit = 60): Promise<any[]> {
    const { poolId } = this.resolvePoolConfig(poolType);

    if (!poolId) {
      throw new BadRequestException(`Pool ${poolType} not configured`);
    }

    try {
      const command = new ListUsersCommand({
        UserPoolId: poolId,
        Limit: limit,
      });

      const response = await this.cognitoClient.send(command);
      return response.Users || [];
    } catch (error: any) {
      console.error('[CognitoService] Failed to list users:', error);
      throw new BadRequestException(`Failed to list users: ${error.message}`);
    }
  }
}

import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CognitoService } from '../auth/cognito.service';
import {
  User,
  UserRole,
  ServiceType,
  isValidEmail,
  isValidPhoneNumber,
  formatPhoneNumber,
  isValidTimezone,
} from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { CompaniesService } from '../companies/companies.service';

@Injectable()
export class UsersService {
  private readonly tableName = 'users';

  constructor(
    private dynamodb: DynamoDBService,
    private cognitoService: CognitoService,
    @Inject(forwardRef(() => CompaniesService))
    private companiesService: CompaniesService
  ) {}

  async createUser(
    companyId: string | undefined,
    companyName: string | undefined,
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: UserRole | undefined,
    poolType: 'users' | 'admin' = 'users',
    companyServiceType?: ServiceType,
    companyEmail?: string,
    companyPhone?: string,
    companyTimezone?: string,
    options?: { skipCognitoCreate?: boolean; skipCognitoCheck?: boolean }
  ): Promise<{ user: User }> {
    const isAdminPool = poolType === 'admin';
    const skipCognitoCreate = options?.skipCognitoCreate === true;
    const skipCognitoCheck = options?.skipCognitoCheck === true;

    // Early duplicate check across DynamoDB and Cognito
    const existingUser = await this.findByEmail(email);
    const cognitoUserExists = skipCognitoCheck
      ? false
      : await this.cognitoService.userExists(email, poolType).catch(() => false);

    if (existingUser || cognitoUserExists) {
      throw new ConflictException({
        message: 'User with this email already exists',
        fields: { email: 'User with this email already exists' },
      });
    }

    // If company_name is provided but no company_id, create a new company
    let resolvedCompanyId: string;
    if (isAdminPool) {
      resolvedCompanyId = 'platform-admin';
    } else if (companyId) {
      resolvedCompanyId = companyId;
    } else if (companyName) {
      if (!companyServiceType || !companyEmail || !companyTimezone) {
        throw new BadRequestException('Company details are required when creating a new company');
      }

      if (!isValidEmail(companyEmail)) {
        throw new BadRequestException('Invalid company email');
      }

      if (!isValidTimezone(companyTimezone)) {
        throw new BadRequestException('Invalid company timezone');
      }

      const formattedPhone =
        companyPhone && isValidPhoneNumber(companyPhone) ? formatPhoneNumber(companyPhone) : undefined;

      const newCompany = await this.companiesService.createCompany(
        companyName,
        companyServiceType,
        companyEmail,
        formattedPhone,
        companyTimezone
      );
      resolvedCompanyId = newCompany.company_id;
      companyName = newCompany.company_name;
    } else {
      throw new BadRequestException('Either company_id or company_name must be provided for customer users');
    }

    const resolvedRole = isAdminPool ? UserRole.ADMIN : role || UserRole.OWNER;

    const userId = uuidv4();
    const timestamp = Date.now();

    const user: User = {
      company_id: resolvedCompanyId,
      user_id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: resolvedRole,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };

    // Always set password as permanent - users can change later in settings
    const makePasswordPermanent = true;

    if (!skipCognitoCreate) {
      // Create user in Cognito with proper attributes
      const fullName = `${firstName} ${lastName}`;
      await this.cognitoService.createUser(
        email,
        password,
        isAdminPool ? undefined : resolvedCompanyId,
        fullName,
        poolType,
        { makePasswordPermanent }
      );

      // Update Cognito custom attributes with company name if provided
      if (!isAdminPool && companyName) {
        await this.cognitoService.updateUserAttributes(
          email,
          { 'custom:company_name': companyName },
          poolType
        );
      }

      if (!isAdminPool && resolvedCompanyId) {
        await this.cognitoService.updateUserAttributes(
          email,
          { 'custom:company_id': resolvedCompanyId },
          poolType
        );
      }
    }

    // Store user data. No password hash stored.
    const dbUser = {
      ...user,
      pool_type: poolType,
    };

    try {
      await this.dynamodb.put(this.tableName, dbUser);
    } catch (dbErr) {
      if (!skipCognitoCreate) {
        // Roll back Cognito user to avoid orphaned identities
        try {
          await this.cognitoService.deleteUser(email, poolType);
        } catch (rollbackErr) {
          console.error('[UsersService] Failed to rollback Cognito user after DB error:', rollbackErr);
        }
      }
      throw dbErr;
    }

    return { user };
  }

  async provisionUserFromCognito(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    serviceType?: ServiceType;
    timezone?: string;
  }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.findByEmail(email);
    if (existingUser) return existingUser;

    const resolvedFirstName = input.firstName?.trim() || email.split('@')[0] || 'Owner';
    const resolvedLastName = input.lastName?.trim() || 'Account';
    const resolvedTimezone = input.timezone?.trim() || 'America/New_York';
    const resolvedServiceType =
      (input.serviceType && Object.values(ServiceType).includes(input.serviceType)) ? input.serviceType : ServiceType.OTHER;
    const resolvedCompanyName = input.companyName?.trim() || `HandyCall Account ${uuidv4().slice(0, 8)}`;

    const company = await this.companiesService.createCompany(
      resolvedCompanyName,
      resolvedServiceType,
      email,
      undefined,
      resolvedTimezone,
      { allowExisting: true, companyProfileCompleted: false, serviceAreaCompleted: false }
    );

    const userId = uuidv4();
    const timestamp = Date.now();

    const user: User = {
      company_id: company.company_id,
      user_id: userId,
      email,
      phone_number: undefined,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      role: UserRole.OWNER,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const dbUser = {
      ...user,
      pool_type: 'users',
    };

    await this.dynamodb.put(this.tableName, dbUser);

    try {
      await this.cognitoService.updateUserAttributes(
        email,
        { 'custom:company_id': company.company_id, 'custom:company_name': company.company_name },
        'users'
      );
    } catch (error) {
      // Non-fatal: user can still proceed even if attributes fail to update
      console.warn('[UsersService] Failed to update Cognito attributes for provisioned user', error);
    }

    return user;
  }

  private generateSecurePassword(): string {
    // Ensure mix of upper, lower, digits, and symbols, 14 chars
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*()';
    const bytes = randomBytes(16);
    let pwd = '';
    for (let i = 0; i < 14; i++) {
      pwd += chars[bytes[i] % chars.length];
    }
    // Guarantee at least one of each required class
    pwd += 'A1a!';
    return pwd;
  }

  async findByEmail(email: string): Promise<User | null> {
    // The email-index in production uses company_id as the partition key and email as the sort key.
    // Since we don't always have company_id, fall back to a scan with a filter on email.
    // Note: Removed limit because DynamoDB Limit applies to items EXAMINED (not returned).
    // With Limit: 1, if the first item doesn't match the filter, scan stops and misses the actual user.
    const result = await this.dynamodb.scan(this.tableName, {
      filterExpression: '#email = :email',
      expressionAttributeNames: { '#email': 'email' },
      expressionAttributeValues: { ':email': email },
    });

    if (result.items.length === 0) {
        return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...user } = result.items[0] as any;
    return user as User;
  }

  async findByEmailForCompany(
    email: string,
    companyId: string
  ): Promise<User | null> {
    // Production email index keys differ; safest is a filtered scan scoped by company_id + email.
    const result = await this.dynamodb.scan(this.tableName, {
      filterExpression: '#company_id = :company_id AND #email = :email',
      expressionAttributeNames: { '#company_id': 'company_id', '#email': 'email' },
      expressionAttributeValues: { ':company_id': companyId, ':email': email },
      limit: 1,
    });

    if (result.items.length === 0) {
        return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...user } = result.items[0] as any;
    return user as User;
  }

  async setPasswordResetToken(email: string, tokenHash: string, expiresAt: number): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) return;
    await this.dynamodb.update(
      this.tableName,
      { company_id: (user as any).company_id, user_id: (user as any).user_id },
      {
        reset_token_hash: tokenHash,
        reset_token_expires_at: expiresAt,
        updated_at: Date.now(),
      }
    );
  }

  async clearPasswordResetToken(email: string): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) return;
    await this.dynamodb.update(
      this.tableName,
      { company_id: (user as any).company_id, user_id: (user as any).user_id },
      {
        reset_token_hash: null,
        reset_token_expires_at: null,
        updated_at: Date.now(),
      }
    );
  }

  async findById(companyId: string, userId: string): Promise<User | null> {
    const user = await this.dynamodb.get(this.tableName, {
      company_id: companyId,
      user_id: userId,
    });

    if (!user) {
      return null;
    }

    // Remove password_hash from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = user as any;
    return userWithoutPassword as User;
  }

  async updateLastLogin(companyId: string, userId: string): Promise<void> {
    await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      { last_login_at: Date.now(), updated_at: Date.now() }
    );
  }

  async updateMyProfile(
    companyId: string,
    userId: string,
    updates: {
      first_name?: string;
      last_name?: string;
      contact_email?: string;
      email?: string;
      phone_number?: string;
      phone_verified_at?: number;
    }
  ): Promise<User> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const firstName = updates.first_name?.trim();
    const lastName = updates.last_name?.trim();
    const contactEmail = updates.contact_email?.trim();
    const nextEmail = updates.email?.trim();
    const nextPhone = updates.phone_number?.trim();

    if (contactEmail && !isValidEmail(contactEmail)) {
      throw new BadRequestException('Invalid contact email');
    }
    if (nextEmail && !isValidEmail(nextEmail)) {
      throw new BadRequestException('Invalid email');
    }
    if (nextPhone && !isValidPhoneNumber(nextPhone)) {
      throw new BadRequestException('Invalid phone number format (use E.164: +1234567890)');
    }

    const updatedData: Record<string, any> = {
      updated_at: Date.now(),
    };

    if (firstName) updatedData.first_name = firstName;
    if (lastName) updatedData.last_name = lastName;
    if (contactEmail) updatedData.contact_email = contactEmail;
    if (nextEmail) updatedData.email = nextEmail;
    if (nextPhone) updatedData.phone_number = formatPhoneNumber(nextPhone);
    if (updates.phone_verified_at) updatedData.phone_verified_at = updates.phone_verified_at;

    const result = await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      updatedData
    );

    const poolType: 'users' | 'admin' =
      (user as any).pool_type === 'admin' || (user.role === UserRole.ADMIN && user.company_id === 'platform-admin')
        ? 'admin'
        : 'users';

    const attributesToUpdate: Record<string, string> = {};
    if (firstName) attributesToUpdate['given_name'] = firstName;
    if (lastName) attributesToUpdate['family_name'] = lastName;
    if (firstName || lastName) {
      attributesToUpdate['name'] = [firstName || user.first_name, lastName || user.last_name].filter(Boolean).join(' ');
    }
    if (nextEmail && nextEmail !== user.email) {
      attributesToUpdate['email'] = nextEmail;
      attributesToUpdate['email_verified'] = 'true';
    }
    if (nextPhone) {
      attributesToUpdate['phone_number'] = formatPhoneNumber(nextPhone);
      attributesToUpdate['phone_number_verified'] = 'true';
    }

    if (Object.keys(attributesToUpdate).length > 0) {
      try {
        await this.cognitoService.updateUserAttributes(user.email, attributesToUpdate, poolType);
      } catch (err) {
        console.warn('[UsersService] Failed to update Cognito name attributes for profile update', err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = result as any;
    return userWithoutPassword as User;
  }

  async markPhoneVerified(companyId: string, userId: string, phoneNumber: string): Promise<User> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const formatted = formatPhoneNumber(phoneNumber);
    const result = await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      {
        phone_number: formatted,
        phone_verified_at: Date.now(),
        updated_at: Date.now(),
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = result as any;
    return userWithoutPassword as User;
  }

  async listCompanyUsers(companyId: string): Promise<(User & { company_name?: string })[]> {
    const result = await this.dynamodb.query(
      this.tableName,
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId }
    );

    // Remove password hashes from all users and attach company name
    const users = result.items.map((user: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword as User;
    });
    const company = await this.companiesService.findById(companyId).catch(() => null);

    return users.map((user) => ({
      ...user,
      company_name:
        user.company_id === 'platform-admin'
          ? 'Admin'
          : company?.company_name,
    }));
  }

  /**
   * List all users across all companies (admin only)
   */
  async listAllUsers(): Promise<(User & { company_name?: string })[]> {
    const result = await this.dynamodb.scan(this.tableName);

    // Build a map of company_id -> company_name so the UI can render without a second request
    let companyMap = new Map<string, string>();
    try {
      const companies = await this.companiesService.listAll(500);
      companyMap = new Map(companies.map((company) => [company.company_id, company.company_name]));
    } catch (error) {
      console.warn('[UsersService] Failed to load companies while listing users:', error);
    }

    // Remove password hashes from all users and attach company name when available
    return result.items.map((user: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...userWithoutPassword } = user;
      const companyName =
        userWithoutPassword.company_id === 'platform-admin'
          ? 'Admin'
          : companyMap.get(userWithoutPassword.company_id);
      return {
        ...userWithoutPassword,
        company_name: companyName,
      } as User & { company_name?: string };
    });
  }

  /**
   * Update user details (admin only)
   */
  async updateUser(
    companyId: string,
    userId: string,
    updates: {
      company_id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      role?: UserRole;
      phone_number?: string;
      is_active?: boolean;
    }
  ): Promise<User> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedData = {
      ...updates,
      updated_at: Date.now(),
    };

    const result = await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      updatedData
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = result as any;
    return userWithoutPassword as User;
  }

  /**
   * Delete user from Cognito and DynamoDB (admin only)
   */
  async deleteUser(companyId: string, userId: string, email: string): Promise<void> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const poolType: 'users' | 'admin' =
      (user as any).pool_type === 'admin' || (user.role === UserRole.ADMIN && user.company_id === 'platform-admin')
        ? 'admin'
        : 'users';

    // Delete from Cognito
    await this.cognitoService.deleteUser(email, poolType);

    // Delete from DynamoDB
    await this.dynamodb.delete(this.tableName, { company_id: companyId, user_id: userId });
  }

  /**
   * Disable user account (admin only)
   */
  async disableUser(companyId: string, userId: string, email: string): Promise<User> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const poolType: 'users' | 'admin' =
      (user as any).pool_type === 'admin' || (user.role === UserRole.ADMIN && user.company_id === 'platform-admin')
        ? 'admin'
        : 'users';

    // Disable in Cognito
    await this.cognitoService.disableUser(email, poolType);

    // Update in DynamoDB
    const result = await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      { is_active: false, updated_at: Date.now() }
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = result as any;
    return userWithoutPassword as User;
  }

  /**
   * Enable user account (admin only)
   */
  async enableUser(companyId: string, userId: string, email: string): Promise<User> {
    const user = await this.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const poolType: 'users' | 'admin' =
      (user as any).pool_type === 'admin' || (user.role === UserRole.ADMIN && user.company_id === 'platform-admin')
        ? 'admin'
        : 'users';

    // Enable in Cognito
    await this.cognitoService.enableUser(email, poolType);

    // Update in DynamoDB
    const result = await this.dynamodb.update(
      this.tableName,
      { company_id: companyId, user_id: userId },
      { is_active: true, updated_at: Date.now() }
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = result as any;
    return userWithoutPassword as User;
  }

  /**
   * Move an existing user record to a new company_id (used after initial setup)
   */
  async moveUserToCompany(
    existingUser: any,
    newCompanyId: string,
    firstName?: string,
    lastName?: string
  ): Promise<User> {
    const timestamp = Date.now();

    // Remove old record keyed by previous company_id
    await this.dynamodb.delete(this.tableName, {
      company_id: existingUser.company_id,
      user_id: existingUser.user_id,
    });

    const updatedRecord = {
      ...existingUser,
      company_id: newCompanyId,
      first_name: firstName || existingUser.first_name,
      last_name: lastName || existingUser.last_name,
      updated_at: timestamp,
    };

    await this.dynamodb.put(this.tableName, updatedRecord);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = updatedRecord as any;
    return userWithoutPassword as User;
  }
}

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import {
  Company,
  CompanyStatus,
  ServiceType,
  BusinessHours,
  SubscriptionPlan,
  SubscriptionStatus,
  CallHandlingMode,
} from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';
import { resolveServiceTemplateId } from './service-template-map';

export interface CompanyStats {
  total_calls: number;
  total_users: number;
  ai_handled_calls: number;
  ai_handled_percentage: number;
  total_contacts: number;
  total_appointments: number;
  revenue?: number;
}

export interface CompanyListItem extends Company {
  stats?: CompanyStats;
}

@Injectable()
export class CompaniesService {
  private readonly tableName = 'companies';

  constructor(private dynamodb: DynamoDBService) {}

  private buildBookingFromEmail(companyName: string, companyId: string): string {
    const domain = process.env.BOOKING_EMAIL_DOMAIN || process.env.SES_FROM_DOMAIN || 'handycall.org';
    const slug = String(companyName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    const local = `no-reply+${slug || companyId}`;
    return `${local}@${domain}`;
  }

  async findByName(companyName: string): Promise<Company | null> {
    // Case-insensitive match via scan (tables are small enough for admin operations)
    const result = await this.dynamodb.scan(this.tableName, {
      filterExpression: 'contains(#name, :name)',
      expressionAttributeNames: { '#name': 'company_name' },
      expressionAttributeValues: { ':name': companyName },
      limit: 5,
    });

    return (
      result.items.find(
        (item: any) => item.company_name?.toLowerCase() === companyName.toLowerCase()
      ) as Company | null
    ) ?? null;
  }

  async createCompany(
    companyName: string,
    serviceType: ServiceType,
    email: string,
    phoneNumber: string | undefined,
    timezone: string,
    options?: {
      allowExisting?: boolean;
      companyProfileCompleted?: boolean;
      serviceAreaCompleted?: boolean;
      serviceAreaZipcodes?: string[];
      serviceAreaCities?: string[];
    }
  ): Promise<Company> {
    // Collect conflicts to report them all at once
    const conflicts: Record<string, string> = {};

    // Check if company with email already exists
    const existingByEmail = await this.findByEmail(email);
    if (existingByEmail) {
      if (options?.allowExisting) return existingByEmail;
      conflicts.email = 'Company with this email already exists';
    }

    // Check if company with phone already exists (optional at account creation)
    if (phoneNumber) {
      const existingByPhone = await this.findByPhone(phoneNumber);
      if (existingByPhone) {
        if (options?.allowExisting) return existingByPhone;
        conflicts.phone_number = 'Company with this phone number already exists';
      }
    }

    // Check company name uniqueness (case-insensitive)
    const existingByName = await this.findByName(companyName);
    if (existingByName) {
      if (options?.allowExisting) return existingByName;
      conflicts.company_name = 'Company with this name already exists';
    }

    if (Object.keys(conflicts).length > 0) {
      throw new ConflictException({
        message: 'Company already exists',
        fields: conflicts,
      });
    }

    const companyId = uuidv4();
    const timestamp = Date.now();

    // Default business hours (M-F 9-5)
    const defaultBusinessHours: BusinessHours = {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '09:00', close: '17:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '09:00', close: '17:00' },
    };

    const company: Company = {
      company_id: companyId,
      company_name: companyName,
      service_type: serviceType,
      service_template_id: resolveServiceTemplateId(serviceType),
      ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      email,
      booking_from_email: this.buildBookingFromEmail(companyName, companyId),
      status: CompanyStatus.INACTIVE,
      timezone,
      business_hours: defaultBusinessHours,
      call_handling_mode: CallHandlingMode.ALWAYS,
      service_area_zipcodes: options?.serviceAreaZipcodes ?? [],
      service_area_cities: options?.serviceAreaCities ?? [],
      company_profile_completed: options?.companyProfileCompleted ?? false,
      service_area_completed: options?.serviceAreaCompleted ?? false,
      created_at: timestamp,
      updated_at: timestamp,
      calls_enabled: false, // Start disabled until a plan is active
      sms_enabled: false, // Start disabled until a plan is active
      calendar_setup_completed: false,
      schedule_setup_completed: false,
      calendar_mode: 'INTERNAL',
      calendar_provider: 'NONE',
      stripe_connect_onboarding_complete: false,
      booking_payment_enabled: false,
      booking_payment_mode: 'SELF_MANAGED',
      booking_services: [],
      follow_up_sequences_enabled: false,
      follow_up_initial_delay_minutes: 0,
      follow_up_second_delay_minutes: 24 * 60,
      follow_up_final_delay_minutes: 3 * 24 * 60,
      review_request_enabled: false,
      review_request_delay_minutes: 120,
      website_widget_enabled: false,
    };

    await this.dynamodb.put(this.tableName, company);

    return company;
  }

  async findById(companyId: string): Promise<Company | null> {
    const company = await this.dynamodb.get(this.tableName, { company_id: companyId });
    if (!company) return null;
    const finalized = await this.finalizeExpiredCancellation(company as Company);
    return this.normalizeNoPlanStatus(finalized);
  }

  async findByEmail(email: string): Promise<Company | null> {
    // Production email index uses company_id as the partition key; safest is a filtered scan by email.
    const result = await this.dynamodb.scan(this.tableName, {
      filterExpression: '#email = :email',
      expressionAttributeNames: { '#email': 'email' },
      expressionAttributeValues: { ':email': email },
      limit: 1,
    });

    return result.items.length > 0 ? (result.items[0] as Company) : null;
  }

  async findByPhone(phoneNumber: string): Promise<Company | null> {
    // Phone index keys differ between environments; use filtered scan to avoid key schema issues.
    const result = await this.dynamodb.scan(this.tableName, {
      filterExpression: '#phone_number = :phone_number',
      expressionAttributeNames: { '#phone_number': 'phone_number' },
      expressionAttributeValues: { ':phone_number': phoneNumber },
      limit: 1,
    });

    return result.items.length > 0 ? (result.items[0] as Company) : null;
  }

  async updateCompany(
    companyId: string,
    updates: {
      company_name?: string;
      service_type?: ServiceType;
      phone_number?: string;
      email?: string;
      timezone?: string;
      business_hours?: BusinessHours;
      schedule_overrides?: any;
      appointment_duration_minutes?: number;
      slot_interval_minutes?: number;
      status?: CompanyStatus;
      subscription_tier?: string;
      trial_ends_at?: number | null;
      trial_used_at?: number | null;
      calls_enabled?: boolean;
      sms_enabled?: boolean;
      usage_service_blocked?: {
        calls?: boolean;
        sms?: boolean;
        updated_at?: number;
      };
      transfer_enabled?: boolean;
      transfer_number?: string;
      call_handling_mode?: CallHandlingMode;
      use_simple_scheduling?: boolean;
      // Billing fields
      stripe_customer_id?: string;
      stripe_subscription_id?: string | null;
      subscription_plan?: SubscriptionPlan | null;
      subscription_status?: SubscriptionStatus | null;
      current_period_start?: number | null;
      current_period_end?: number | null;
      payment_method_last4?: string;
      payment_method_brand?: string;
      cancel_at_period_end?: boolean;
      stripe_connect_account_id?: string;
      stripe_connect_onboarding_complete?: boolean;
      booking_payment_enabled?: boolean;
      booking_payment_mode?: 'HANDYCALL_MANAGED' | 'SELF_MANAGED';
      booking_services?: Array<{
        service_id: string;
        name: string;
        description?: string;
        amount_cents: number;
        currency?: string;
        duration_minutes?: number;
        active?: boolean;
        collect_payment?: boolean;
        billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
        billing_interval?: 'day' | 'week' | 'month' | 'year';
        billing_interval_count?: number;
        trial_period_days?: number;
      }>;
      follow_up_sequences_enabled?: boolean;
      follow_up_initial_delay_minutes?: number;
      follow_up_second_delay_minutes?: number;
      follow_up_final_delay_minutes?: number;
      follow_up_initial_template?: string;
      follow_up_second_template?: string;
      follow_up_final_template?: string;
      review_request_enabled?: boolean;
      review_request_delay_minutes?: number;
      review_platform_url?: string;
      review_request_template?: string;
      website_widget_enabled?: boolean;
      website_widget_settings?: {
        primary_color?: string;
        position?: 'BOTTOM_RIGHT' | 'BOTTOM_LEFT';
        greeting?: string;
      };
      // Calendar fields
      calendar_setup_completed?: boolean;
      schedule_setup_completed?: boolean;
      calendar_mode?: 'INTERNAL' | 'EXTERNAL';
      calendar_provider?: 'NONE' | 'GOOGLE' | 'MICROSOFT' | 'APPLE';
      calendar_connection?: any;
      service_area_zipcodes?: string[];
      service_area_cities?: string[];
      pricing_profile?: Record<string, any>;
      company_profile_completed?: boolean;
      service_area_completed?: boolean;
      service_template_id?: string;
    }
  ): Promise<Company> {
    const company = await this.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const updatedData: Record<string, any> = {
      ...updates,
      updated_at: Date.now(),
    };

    if (updates.service_type && !updates.service_template_id) {
      updatedData.service_template_id = resolveServiceTemplateId(updates.service_type);
    }

    const nextStatus = updates.status ?? company.status;
    if (nextStatus === CompanyStatus.INACTIVE || nextStatus === CompanyStatus.SUSPENDED) {
      updatedData.calls_enabled = false;
      updatedData.sms_enabled = false;
    }

    const result = await this.dynamodb.update(this.tableName, { company_id: companyId }, updatedData);

    return result as Company;
  }

  /**
   * Update AWS Connect phone number details for a company
   */
  async updateConnectPhoneNumber(
    companyId: string,
    phoneData: {
      connect_phone_number_id?: string;
      connect_phone_number?: string;
      connect_instance_id?: string;
    }
  ): Promise<Company> {
    const company = await this.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const updatedData = {
      ...phoneData,
      updated_at: Date.now(),
    };

    const result = await this.dynamodb.update(this.tableName, { company_id: companyId }, updatedData);
    return result as Company;
  }

  /**
   * Find company by AWS Connect phone number
   */
  async findByConnectPhoneNumber(phoneNumber: string): Promise<Company | null> {
    try {
      // Query using connect-phone-index GSI (PK: connect_phone_number)
      const result = await this.dynamodb.query(
        this.tableName,
        '#connect_phone_number = :phone',
        { '#connect_phone_number': 'connect_phone_number' },
        { ':phone': phoneNumber },
        { indexName: 'connect-phone-index', limit: 1 }
      );

      if (!result || result.items.length === 0) {
        // Fallback to scan if GSI doesn't exist yet
        const scanResult = await this.dynamodb.scan(this.tableName, {
          filterExpression: 'connect_phone_number = :phone',
          expressionAttributeValues: { ':phone': phoneNumber },
          limit: 1,
        });

        return scanResult.items.length > 0 ? (scanResult.items[0] as Company) : null;
      }

      return result.items[0] as Company;
    } catch (error: any) {
      console.error('Error finding company by Connect phone number:', error);
      return null;
    }
  }

  /**
   * List all companies (admin only)
   */
  async listAll(limit = 100): Promise<Company[]> {
    const result = await this.dynamodb.scan(this.tableName, { limit });
    const companies = result.items as Company[];
    return Promise.all(
      companies.map(async (company) => {
        const finalized = await this.finalizeExpiredCancellation(company);
        return this.normalizeNoPlanStatus(finalized);
      })
    );
  }

  /**
   * Delete a company and all associated data (admin only)
   * WARNING: This is a destructive operation
   */
  async deleteCompany(companyId: string): Promise<void> {
    const company = await this.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Delete from companies table
    await this.dynamodb.delete(this.tableName, { company_id: companyId });

    // Delete all related data
    // Note: In a production system, you'd want to do this in a transaction or use DynamoDB Streams
    await Promise.all([
      this.deleteRelatedData('users', companyId),
      this.deleteRelatedData('calls', companyId),
      this.deleteRelatedData('contacts', companyId),
      this.deleteRelatedData('appointments', companyId),
      this.deleteRelatedData('knowledge_items', companyId),
      this.deleteRelatedData('flagged_questions', companyId),
      this.deleteRelatedData('agent_configs', companyId),
      this.deleteRelatedData('pricing_rules', companyId),
      this.deleteRelatedData('webhook_configs', companyId),
      this.deleteRelatedData('notification_preferences', companyId),
      this.deleteRelatedData('notifications', companyId),
      this.deleteRelatedData('notification_devices', companyId),
      this.deleteRelatedData('notification_usage_alerts', companyId),
    ]);
  }

  /**
   * Helper to delete all items for a company from a table
   */
  private async deleteRelatedData(tableName: string, companyId: string): Promise<void> {
    try {
      const result = await this.dynamodb.query(
        tableName,
        '#company_id = :company_id',
        { '#company_id': 'company_id' },
        { ':company_id': companyId }
      );

      // Delete each item
      for (const item of result.items) {
        const keys = this.getTableKeys(tableName, item);
        if (keys) {
          await this.dynamodb.delete(tableName, keys);
        }
      }
    } catch (error) {
      console.error(`Failed to delete related data from ${tableName}:`, error);
      // Continue with other deletions even if one fails
    }
  }

  /**
   * Get the primary key for a table item
   */
  private getTableKeys(tableName: string, item: any): any {
    const keyMap: Record<string, string[]> = {
      users: ['company_id', 'user_id'],
      calls: ['company_id', 'call_id'],
      contacts: ['company_id', 'contact_id'],
      appointments: ['company_id', 'appointment_id'],
      knowledge_items: ['company_id', 'knowledge_id'],
      flagged_questions: ['company_id', 'flagged_id'],
      agent_configs: ['company_id', 'config_id'],
      pricing_rules: ['company_id', 'pricing_id'],
      webhook_configs: ['company_id'],
      notification_preferences: ['company_id', 'user_id'],
      notifications: ['company_id', 'notification_id'],
      notification_devices: ['company_id', 'device_id'],
      notification_usage_alerts: ['company_id', 'alert_key'],
    };

    const keyNames = keyMap[tableName];
    if (!keyNames) return null;

    const keys: any = {};
    for (const keyName of keyNames) {
      if (item[keyName]) {
        keys[keyName] = item[keyName];
      }
    }

    return Object.keys(keys).length > 0 ? keys : null;
  }

  /**
   * Get company statistics (admin only)
   */
  async getCompanyStats(companyId: string): Promise<CompanyStats> {
    const company = await this.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Get total users
    const usersResult = await this.dynamodb.query(
      'users',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId }
    );

    // Get total calls
    const callsResult = await this.dynamodb.query(
      'calls',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId }
    );

    // Count AI handled calls
    const aiHandledCalls = callsResult.items.filter((call: any) => call.ai_handled === true).length;

    // Get total contacts
    const contactsResult = await this.dynamodb.query(
      'contacts',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId }
    );

    // Get total appointments
    const appointmentsResult = await this.dynamodb.query(
      'appointments',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId }
    );

    const totalCalls = callsResult.items.length;
    const aiHandledPercentage = totalCalls > 0 ? (aiHandledCalls / totalCalls) * 100 : 0;

    return {
      total_calls: totalCalls,
      total_users: usersResult.items.length,
      ai_handled_calls: aiHandledCalls,
      ai_handled_percentage: Math.round(aiHandledPercentage * 100) / 100,
      total_contacts: contactsResult.items.length,
      total_appointments: appointmentsResult.items.length,
    };
  }

  /**
   * Search companies by name or email
   */
  async searchCompanies(searchTerm: string): Promise<Company[]> {
    const allCompanies = await this.listAll();

    const lowercaseSearch = searchTerm.toLowerCase();
    return allCompanies.filter(company =>
      company.company_name.toLowerCase().includes(lowercaseSearch) ||
      company.email.toLowerCase().includes(lowercaseSearch)
    );
  }

  private async finalizeExpiredCancellation(company: Company): Promise<Company> {
    if (
      company.stripe_subscription_id ||
      !company.cancel_at_period_end ||
      !company.current_period_end ||
      company.current_period_end > Date.now()
    ) {
      return company;
    }

    const updated = await this.dynamodb.update(
      this.tableName,
      { company_id: company.company_id },
      {
        subscription_plan: null,
        subscription_status: null,
        stripe_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        status: CompanyStatus.INACTIVE,
        trial_ends_at: null,
        calls_enabled: false,
        sms_enabled: false,
        updated_at: Date.now(),
      }
    );

    return updated as Company;
  }

  private async normalizeNoPlanStatus(company: Company): Promise<Company> {
    const hasPlan = Boolean(company.subscription_plan || company.stripe_subscription_id);
    const hasStatus = Boolean(company.subscription_status);
    const canceling =
      company.cancel_at_period_end &&
      company.current_period_end &&
      company.current_period_end > Date.now();

    if (!hasPlan && !hasStatus && !canceling && company.status !== CompanyStatus.INACTIVE) {
      const updated = await this.dynamodb.update(
        this.tableName,
        { company_id: company.company_id },
        {
          status: CompanyStatus.INACTIVE,
          calls_enabled: false,
          sms_enabled: false,
          updated_at: Date.now(),
        }
      );
      return updated as Company;
    }

    return company;
  }
}

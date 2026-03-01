import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { Company } from '@handycall/shared';

export interface SystemStats {
  total_companies: number;
  total_users: number;
  total_calls: number;
  total_revenue: number;
  active_companies: number;
  trial_companies: number;
  suspended_companies: number;
}

export interface CompanyWithStats extends Company {
  total_calls: number;
  total_users: number;
  ai_handled_percentage: number;
}

export interface ActivityItem {
  id: string;
  type: 'COMPANY_CREATED' | 'USER_CREATED' | 'CALL_COMPLETED' | 'APPOINTMENT_CREATED';
  description: string;
  company_id?: string;
  company_name?: string;
  timestamp: number;
}

@Injectable()
export class AdminService {
  constructor(
    private dynamodb: DynamoDBService,
    private companiesService: CompaniesService
  ) {}

  /**
   * Get system-wide statistics
   */
  async getSystemStats(): Promise<SystemStats> {
    // Get all companies
    const companies = await this.companiesService.listAll();

    // Get all users
    const usersResult = await this.dynamodb.scan('users');

    // Get all calls
    const callsResult = await this.dynamodb.scan('calls');

    // Count companies by status
    const activeCompanies = companies.filter(c => c.status === 'ACTIVE').length;
    const trialCompanies = companies.filter(c => c.status === 'TRIAL').length;
    const suspendedCompanies = companies.filter(c => c.status === 'SUSPENDED').length;

    return {
      total_companies: companies.length,
      total_users: usersResult.items.length,
      total_calls: callsResult.items.length,
      total_revenue: 0, // TODO: Calculate from billing data
      active_companies: activeCompanies,
      trial_companies: trialCompanies,
      suspended_companies: suspendedCompanies,
    };
  }

  /**
   * Get top companies by usage/revenue
   */
  async getTopCompanies(limit = 10): Promise<CompanyWithStats[]> {
    const companies = await this.companiesService.listAll();
    const companiesWithStats: CompanyWithStats[] = [];

    for (const company of companies) {
      const stats = await this.companiesService.getCompanyStats(company.company_id);

      companiesWithStats.push({
        ...company,
        total_calls: stats.total_calls,
        total_users: stats.total_users,
        ai_handled_percentage: stats.ai_handled_percentage,
      });
    }

    // Sort by total calls (descending)
    companiesWithStats.sort((a, b) => b.total_calls - a.total_calls);

    return companiesWithStats.slice(0, limit);
  }

  /**
   * Get recent activity across all companies
   */
  async getRecentActivity(limit = 20): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = [];

    // Get recent companies
    const companies = await this.companiesService.listAll();
    const recentCompanies = companies
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 5);

    for (const company of recentCompanies) {
      activities.push({
        id: `company-${company.company_id}`,
        type: 'COMPANY_CREATED',
        description: `New company "${company.company_name}" created`,
        company_id: company.company_id,
        company_name: company.company_name,
        timestamp: company.created_at,
      });
    }

    // Get recent users
    const usersResult = await this.dynamodb.scan('users');
    const recentUsers = usersResult.items
      .sort((a: any, b: any) => b.created_at - a.created_at)
      .slice(0, 5);

    for (const user of recentUsers) {
      const company = companies.find(c => c.company_id === user.company_id);
      activities.push({
        id: `user-${user.user_id}`,
        type: 'USER_CREATED',
        description: `New user "${user.first_name} ${user.last_name}" created`,
        company_id: user.company_id,
        company_name: company?.company_name,
        timestamp: user.created_at,
      });
    }

    // Get recent calls
    const callsResult = await this.dynamodb.scan('calls');
    const recentCalls = callsResult.items
      .filter((call: any) => call.status === 'COMPLETED')
      .sort((a: any, b: any) => b.created_at - a.created_at)
      .slice(0, 5);

    for (const call of recentCalls) {
      const company = companies.find(c => c.company_id === call.company_id);
      activities.push({
        id: `call-${call.call_id}`,
        type: 'CALL_COMPLETED',
        description: `Call completed${call.ai_handled ? ' (AI handled)' : ''}`,
        company_id: call.company_id,
        company_name: company?.company_name,
        timestamp: call.created_at,
      });
    }

    // Sort by timestamp (descending) and limit
    activities.sort((a, b) => b.timestamp - a.timestamp);
    return activities.slice(0, limit);
  }

  /**
   * Cancel a company's subscription at period end
   */
  async cancelSubscription(companyId: string): Promise<{ success: boolean; message: string }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Update company status to indicate pending cancellation
    await this.dynamodb.update('companies', { company_id: companyId }, {
      subscription_status: 'CANCELING',
      cancel_at_period_end: true,
      // Legacy attribute name kept for backwards compatibility with older reads.
      subscription_cancel_at_period_end: true,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
    };
  }

  /**
   * Suspend a company's account immediately
   */
  async suspendCompany(companyId: string): Promise<{ success: boolean; message: string }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Suspend the company - disable all services
    await this.dynamodb.update('companies', { company_id: companyId }, {
      status: 'SUSPENDED',
      calls_enabled: false,
      sms_enabled: false,
      suspended_at: Date.now(),
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: 'Account has been suspended and all services disabled',
    };
  }
}

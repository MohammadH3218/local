import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionPlan } from '@handycall/shared';
import { CompaniesService } from '../companies/companies.service';
import { UsageService } from './usage.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsageGateService {
  constructor(
    private readonly companies: CompaniesService,
    private readonly usage: UsageService,
    private readonly notifications: NotificationsService,
  ) {}

  async isServiceAllowed(
    companyId: string,
    metric: 'minutes' | 'sms',
  ): Promise<{ allowed: boolean; blocked_metrics: Array<'minutes' | 'sms' | 'contacts'>; reset_at?: number }> {
    const status = await this.getBlockedStatus(companyId);
    const isBlocked = metric === 'minutes' ? status.calls_blocked : status.sms_blocked;
    return {
      allowed: !isBlocked,
      blocked_metrics: status.blocked_metrics,
      reset_at: status.reset_at,
    };
  }

  async getBlockedStatus(companyId: string): Promise<{
    plan: SubscriptionPlan | null;
    blocked_metrics: Array<'minutes' | 'sms' | 'contacts'>;
    calls_blocked: boolean;
    sms_blocked: boolean;
    contacts_blocked: boolean;
    reset_at?: number;
  }> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    const rawPlan = String(company.subscription_plan || '').toUpperCase();
    const hasPlan = Object.values(SubscriptionPlan).includes(rawPlan as SubscriptionPlan);
    if (!hasPlan) {
      return {
        plan: null,
        blocked_metrics: [],
        calls_blocked: false,
        sms_blocked: false,
        contacts_blocked: false,
      };
    }

    const plan = rawPlan as SubscriptionPlan;
    const periodStart = Number(company.current_period_start || this.getCurrentMonthStartUtc());
    const limits = await this.usage.checkLimitsExceeded(companyId, plan, periodStart);

    const blockedMetrics: Array<'minutes' | 'sms' | 'contacts'> = [];
    if (limits.minutes.exceeded) blockedMetrics.push('minutes');
    if (limits.sms.exceeded) blockedMetrics.push('sms');
    if (limits.contacts.exceeded) blockedMetrics.push('contacts');

    return {
      plan,
      blocked_metrics: blockedMetrics,
      calls_blocked: limits.minutes.exceeded,
      sms_blocked: limits.sms.exceeded,
      contacts_blocked: limits.contacts.exceeded,
      reset_at: company.current_period_end || undefined,
    };
  }

  async enforceUsagePolicy(companyId: string): Promise<{
    calls_enabled: boolean;
    sms_enabled: boolean;
    blocked_metrics: Array<'minutes' | 'sms' | 'contacts'>;
  }> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    const status = await this.getBlockedStatus(companyId);
    const currentlyBlockedByUsage = company.usage_service_blocked || {};

    let nextCallsEnabled = company.calls_enabled !== false;
    let nextSmsEnabled = company.sms_enabled !== false;

    const updates: any = {};
    const newlyBlocked: string[] = [];
    const restored: string[] = [];

    if (status.calls_blocked && nextCallsEnabled) {
      nextCallsEnabled = false;
      updates.calls_enabled = false;
      newlyBlocked.push('calls');
    } else if (!status.calls_blocked && currentlyBlockedByUsage.calls && company.calls_enabled === false) {
      nextCallsEnabled = true;
      updates.calls_enabled = true;
      restored.push('calls');
    }

    if (status.sms_blocked && nextSmsEnabled) {
      nextSmsEnabled = false;
      updates.sms_enabled = false;
      newlyBlocked.push('sms');
    } else if (!status.sms_blocked && currentlyBlockedByUsage.sms && company.sms_enabled === false) {
      nextSmsEnabled = true;
      updates.sms_enabled = true;
      restored.push('sms');
    }

    const hasUsageBlock = status.calls_blocked || status.sms_blocked;
    const nextUsageBlocked = {
      calls: status.calls_blocked,
      sms: status.sms_blocked,
      updated_at: Date.now(),
    };
    if (
      currentlyBlockedByUsage.calls !== nextUsageBlocked.calls ||
      currentlyBlockedByUsage.sms !== nextUsageBlocked.sms
    ) {
      updates.usage_service_blocked = nextUsageBlocked;
    }

    if (Object.keys(updates).length > 0) {
      await this.companies.updateCompany(companyId, updates);
    }

    if (newlyBlocked.length > 0) {
      await this.notifications.emitServiceAvailabilityEvent(companyId, 'disabled', {
        reason:
          'Calls now ring your business number directly where possible until your billing period resets.',
        blocked_services: newlyBlocked,
        reset_at: status.reset_at,
      });
    } else if (!hasUsageBlock && restored.length > 0) {
      await this.notifications.emitServiceAvailabilityEvent(companyId, 'restored', {
        reason: 'Usage is back within limits.',
        blocked_services: [],
        reset_at: status.reset_at,
      });
    }

    return {
      calls_enabled: nextCallsEnabled,
      sms_enabled: nextSmsEnabled,
      blocked_metrics: status.blocked_metrics,
    };
  }

  private getCurrentMonthStartUtc(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }
}


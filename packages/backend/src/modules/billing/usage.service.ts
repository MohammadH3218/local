import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { UsageMetrics, PlanLimits, SubscriptionPlan, PLAN_LIMITS } from '@handycall/shared';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsageService {
  constructor(
    private dynamodb: DynamoDBService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Increment call minutes for today
   */
  async incrementCallMinutes(companyId: string, minutes: number, callsCountDelta: number = 1): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const existing = await this.dynamodb.get('usage_metrics', {
      company_id: companyId,
      date: today,
    });

    if (existing) {
      await this.dynamodb.update(
        'usage_metrics',
        { company_id: companyId, date: today },
        {
          minutes_used: (existing.minutes_used || 0) + minutes,
          calls_count: (existing.calls_count || 0) + callsCountDelta,
          updated_at: Date.now(),
        }
      );
    } else {
      await this.dynamodb.put('usage_metrics', {
        company_id: companyId,
        date: today,
        minutes_used: minutes,
        calls_count: callsCountDelta,
        sms_sent_count: 0,
        contacts_count: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    void this.notifications.emitUsageThresholdNotifications(companyId).catch((err) => {
      console.warn('[UsageService] Failed to emit usage threshold notifications:', err?.message || err);
    });
  }

  /**
   * Increment SMS count for today
   */
  async incrementSmsCount(companyId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const existing = await this.dynamodb.get('usage_metrics', {
      company_id: companyId,
      date: today,
    });

    if (existing) {
      await this.dynamodb.update(
        'usage_metrics',
        { company_id: companyId, date: today },
        {
          sms_sent_count: (existing.sms_sent_count || 0) + 1,
          updated_at: Date.now(),
        }
      );
    } else {
      await this.dynamodb.put('usage_metrics', {
        company_id: companyId,
        date: today,
        minutes_used: 0,
        calls_count: 0,
        sms_sent_count: 1,
        contacts_count: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    void this.notifications.emitUsageThresholdNotifications(companyId).catch((err) => {
      console.warn('[UsageService] Failed to emit usage threshold notifications:', err?.message || err);
    });
  }

  /**
   * Update contacts count for today
   */
  async updateContactsCount(companyId: string, count: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const existing = await this.dynamodb.get('usage_metrics', {
      company_id: companyId,
      date: today,
    });

    if (existing) {
      await this.dynamodb.update(
        'usage_metrics',
        { company_id: companyId, date: today },
        {
          contacts_count: count,
          updated_at: Date.now(),
        }
      );
    } else {
      await this.dynamodb.put('usage_metrics', {
        company_id: companyId,
        date: today,
        minutes_used: 0,
        calls_count: 0,
        sms_sent_count: 0,
        contacts_count: count,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    void this.notifications.emitUsageThresholdNotifications(companyId).catch((err) => {
      console.warn('[UsageService] Failed to emit usage threshold notifications:', err?.message || err);
    });
  }

  /**
   * Get usage for current billing period
   */
  async getCurrentPeriodUsage(companyId: string, periodStart: number): Promise<UsageMetrics> {
    const startDate = new Date(periodStart).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    // Use scan with filters to get usage records (more reliable across table structures)
    const result = await this.dynamodb.scan('usage_metrics', {
      filterExpression: '#company_id = :company_id AND #date BETWEEN :start_date AND :end_date',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#date': 'date',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':start_date': startDate,
        ':end_date': endDate,
      },
      limit: 100,
    });

    // Aggregate totals
    const totals = (result.items as any[]).reduce(
      (acc, item: any) => ({
        minutes_used: acc.minutes_used + (item.minutes_used || 0),
        calls_count: acc.calls_count + (item.calls_count || 0),
        sms_sent_count: acc.sms_sent_count + (item.sms_sent_count || 0),
        contacts_count: Math.max(acc.contacts_count, item.contacts_count || 0), // Take max, not sum
      }),
      { minutes_used: 0, calls_count: 0, sms_sent_count: 0, contacts_count: 0 }
    );

    return {
      company_id: companyId,
      date: 'current_period',
      ...totals,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  /**
   * Get usage history for a date range
   */
  async getUsageHistory(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<UsageMetrics[]> {
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default 30 days

    const result = await this.dynamodb.scan('usage_metrics', {
      filterExpression: '#company_id = :company_id AND #date BETWEEN :start_date AND :end_date',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#date': 'date',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':start_date': start,
        ':end_date': end,
      },
      limit: 100,
    });

    return result.items as UsageMetrics[];
  }

  /**
   * Get plan limits based on subscription plan
   */
  getPlanLimits(plan: SubscriptionPlan): PlanLimits {
    return PLAN_LIMITS[plan];
  }

  /**
   * Check if usage limits are exceeded
   */
  async checkLimitsExceeded(
    companyId: string,
    plan: SubscriptionPlan,
    periodStart: number
  ): Promise<{
    minutes: { used: number; limit: number; percent: number; exceeded: boolean };
    sms: { used: number; limit: number; percent: number; exceeded: boolean };
    contacts: { used: number; limit: number; percent: number; exceeded: boolean };
  }> {
    const usage = await this.getCurrentPeriodUsage(companyId, periodStart);
    const limits = this.getPlanLimits(plan);

    return {
      minutes: {
        used: usage.minutes_used,
        limit: limits.monthly_minutes,
        percent: (usage.minutes_used / limits.monthly_minutes) * 100,
        exceeded: usage.minutes_used >= limits.monthly_minutes,
      },
      sms: {
        used: usage.sms_sent_count,
        limit: limits.sms_limit,
        percent: (usage.sms_sent_count / limits.sms_limit) * 100,
        exceeded: usage.sms_sent_count >= limits.sms_limit,
      },
      contacts: {
        used: usage.contacts_count,
        limit: limits.contacts_limit,
        percent: (usage.contacts_count / limits.contacts_limit) * 100,
        exceeded: usage.contacts_count >= limits.contacts_limit,
      },
    };
  }

  /**
   * Admin: set today's usage counts explicitly
   */
  async setTodayUsage(companyId: string, metrics: { minutes?: number; sms?: number; contacts?: number }) {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.dynamodb.get('usage_metrics', {
      company_id: companyId,
      date: today,
    });

    const next = {
      minutes_used: metrics.minutes ?? 0,
      sms_sent_count: metrics.sms ?? 0,
      contacts_count: metrics.contacts ?? 0,
      calls_count: existing?.calls_count || 0,
      updated_at: Date.now(),
    };

    if (existing) {
      await this.dynamodb.update('usage_metrics', { company_id: companyId, date: today }, next);
    } else {
      await this.dynamodb.put('usage_metrics', {
        company_id: companyId,
        date: today,
        ...next,
        created_at: Date.now(),
      });
    }
  }

  /**
   * Admin: adjust today's usage counts by delta (positive adds, negative removes)
   */
  async adjustTodayUsage(companyId: string, deltas: { minutes?: number; sms?: number; contacts?: number }) {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.dynamodb.get('usage_metrics', {
      company_id: companyId,
      date: today,
    });

    const base = existing || {
      minutes_used: 0,
      sms_sent_count: 0,
      contacts_count: 0,
      calls_count: 0,
    };

    const next = {
      minutes_used: (base.minutes_used || 0) + (deltas.minutes ?? 0),
      sms_sent_count: (base.sms_sent_count || 0) + (deltas.sms ?? 0),
      contacts_count: (base.contacts_count || 0) + (deltas.contacts ?? 0),
      calls_count: base.calls_count || 0,
      updated_at: Date.now(),
    };

    if (existing) {
      await this.dynamodb.update('usage_metrics', { company_id: companyId, date: today }, next);
    } else {
      await this.dynamodb.put('usage_metrics', {
        company_id: companyId,
        date: today,
        ...next,
        created_at: Date.now(),
      });
    }
  }
}

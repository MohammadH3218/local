import { Injectable } from '@nestjs/common';
import { PLAN_LIMITS, SubscriptionPlan } from '@handycall/shared';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

export interface BusinessMetrics {
  revenue_this_month_cents: number;
  lead_conversion_rate: number;
  total_customers: number;
  active_leads: number;
  appointments_this_week: number;
}

export interface UsageSummaryItem {
  used: number;
  limit: number;
  percent: number;
  blocked: boolean;
}

export interface UsageSummary {
  period_start: number;
  period_end: number;
  minutes: UsageSummaryItem;
  sms: UsageSummaryItem;
  contacts: UsageSummaryItem;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  action_url: string;
}

export interface QuickInsights {
  unanswered_questions: number;
  hot_leads_needing_follow_up: number;
  appointments_next_24h: number;
  next_appointment_countdown_minutes: number | null;
  quick_actions: QuickAction[];
}

export interface ActivityFeedItem {
  id: string;
  type: 'CALL' | 'APPOINTMENT' | 'PAYMENT' | 'LEAD';
  title: string;
  description: string;
  created_at: number;
  action_url?: string;
}

// Legacy compatibility for existing clients.
export interface DashboardStats {
  todayCalls: number;
  newLeads: number;
  appointments: number;
  pendingQuestions: number;
}

export interface RecentCall {
  call_id: string;
  caller_phone: string;
  caller_name?: string;
  created_at: string;
  duration?: number;
  status: string;
  summary?: string;
}

export interface UpcomingAppointment {
  appointment_id: string;
  contact_name: string;
  contact_phone: string;
  scheduled_time: string;
  service_type?: string;
  status: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  private isResourceNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const maybe = error as { name?: string; message?: string };
    return (
      maybe.name === 'ResourceNotFoundException' ||
      String(maybe.message || '').includes('Requested resource not found')
    );
  }

  async getDashboardOverview(companyId: string): Promise<{
    metrics: BusinessMetrics;
    usage_summary: UsageSummary;
    quick_insights: QuickInsights;
    activity_feed: ActivityFeedItem[];
  }> {
    const [metrics, usage_summary, quick_insights, activity_feed] = await Promise.all([
      this.getBusinessMetrics(companyId),
      this.getUsageSummary(companyId),
      this.getQuickInsights(companyId),
      this.getActivityFeed(companyId, 30),
    ]);

    return { metrics, usage_summary, quick_insights, activity_feed };
  }

  async getBusinessMetrics(companyId: string): Promise<BusinessMetrics> {
    const now = Date.now();
    const monthStart = this.getMonthStartUtc(now);
    const weekStart = this.getWeekStartUtc(now);
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

    const [contacts, appointments, payments] = await Promise.all([
      this.scanByCompany('contacts', companyId, 1000),
      this.scanByCompany('appointments', companyId, 1000),
      this.scanByCompany('customer_payments', companyId, 1000),
    ]);

    const totalCustomers = contacts.length;
    const activeLeads = contacts.filter((contact: any) => {
      const lead = String(contact?.lead_status || '').toUpperCase();
      return lead === 'NEW' || lead === 'CONTACTED' || lead === 'QUALIFIED';
    }).length;

    const convertedSignals = new Set<string>();
    for (const appointment of appointments as any[]) {
      const status = String(appointment?.status || '').toUpperCase();
      if (status === 'CANCELLED') continue;
      const contactId = String(appointment?.contact_id || '').trim();
      const contactPhone = String(appointment?.contact_phone || '').trim();
      if (contactId) convertedSignals.add(`id:${contactId}`);
      if (contactPhone) convertedSignals.add(`phone:${contactPhone}`);
    }

    let convertedCustomers = 0;
    for (const contact of contacts as any[]) {
      const contactId = String(contact?.contact_id || '').trim();
      const phone = String(contact?.phone_number || contact?.phone || '').trim();
      if ((contactId && convertedSignals.has(`id:${contactId}`)) || (phone && convertedSignals.has(`phone:${phone}`))) {
        convertedCustomers += 1;
      }
    }

    const leadConversionRate = totalCustomers > 0
      ? Number(((convertedCustomers / totalCustomers) * 100).toFixed(1))
      : 0;

    const appointmentsThisWeek = appointments.filter((appointment: any) => {
      const start = Number(appointment?.scheduled_start || 0);
      const status = String(appointment?.status || '').toUpperCase();
      return start >= weekStart && start < weekEnd && status !== 'CANCELLED';
    }).length;

    const revenueThisMonth = payments.reduce((sum: number, payment: any) => {
      const effectiveTs = Number(payment?.paid_at || payment?.created_at || 0);
      const status = String(payment?.payment_status || '').toUpperCase();
      if (status !== 'SUCCEEDED') return sum;
      if (effectiveTs < monthStart || effectiveTs > now) return sum;
      return sum + Number(payment?.amount_cents || 0);
    }, 0);

    return {
      revenue_this_month_cents: revenueThisMonth,
      lead_conversion_rate: leadConversionRate,
      total_customers: totalCustomers,
      active_leads: activeLeads,
      appointments_this_week: appointmentsThisWeek,
    };
  }

  async getUsageSummary(companyId: string): Promise<UsageSummary> {
    const now = Date.now();
    const company = await this.dynamodb.get('companies', { company_id: companyId });
    const rawPlan = String(company?.subscription_plan || '').toUpperCase();
    const plan = Object.values(SubscriptionPlan).includes(rawPlan as SubscriptionPlan)
      ? (rawPlan as SubscriptionPlan)
      : SubscriptionPlan.STARTER;
    const limits = PLAN_LIMITS[plan];

    const periodStart = Number(company?.current_period_start || this.getMonthStartUtc(now));
    const periodEnd = Number(
      company?.current_period_end ||
      this.getMonthStartUtc(now + 32 * 24 * 60 * 60 * 1000),
    );

    const startDate = new Date(periodStart).toISOString().split('T')[0];
    const endDate = new Date(now).toISOString().split('T')[0];
    let usageRows: { items: any[] } = { items: [] };
    try {
      usageRows = await this.dynamodb.scan('usage_metrics', {
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
        limit: 400,
      });
    } catch (error) {
      if (!this.isResourceNotFoundError(error)) throw error;
      console.warn('[DashboardService] usage_metrics table missing. Returning zero usage summary.');
    }

    const aggregate = (usageRows.items || []).reduce(
      (acc: any, row: any) => ({
        minutes_used: acc.minutes_used + Number(row?.minutes_used || 0),
        sms_sent_count: acc.sms_sent_count + Number(row?.sms_sent_count || 0),
        contacts_count: Math.max(acc.contacts_count, Number(row?.contacts_count || 0)),
      }),
      { minutes_used: 0, sms_sent_count: 0, contacts_count: 0 },
    );

    const toSummary = (used: number, limit: number): UsageSummaryItem => {
      const safeLimit = Math.max(limit || 0, 1);
      const percent = Number(((used / safeLimit) * 100).toFixed(1));
      return {
        used,
        limit,
        percent,
        blocked: used >= limit,
      };
    };

    return {
      period_start: periodStart,
      period_end: periodEnd,
      minutes: toSummary(aggregate.minutes_used, limits.monthly_minutes),
      sms: toSummary(aggregate.sms_sent_count, limits.sms_limit),
      contacts: toSummary(aggregate.contacts_count, limits.contacts_limit),
    };
  }

  async getQuickInsights(companyId: string): Promise<QuickInsights> {
    const now = Date.now();
    const next24h = now + 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const [flaggedQuestions, contacts, appointments] = await Promise.all([
      this.scanByCompany('flagged_questions', companyId, 400),
      this.scanByCompany('contacts', companyId, 1000),
      this.scanByCompany('appointments', companyId, 1000),
    ]);

    const unanswered = flaggedQuestions.filter((item: any) => {
      const status = String(item?.status || '').toUpperCase();
      return status === 'PENDING' || status === 'OPEN';
    }).length;

    const hotLeads = contacts.filter((contact: any) => {
      const createdAt = Number(contact?.created_at || 0);
      if (createdAt < sevenDaysAgo) return false;
      const lead = String(contact?.lead_status || '').toUpperCase();
      return lead === 'NEW' || lead === 'CONTACTED' || lead === 'QUALIFIED' || !lead;
    }).length;

    const upcomingAppointments = appointments.filter((appointment: any) => {
      const start = Number(appointment?.scheduled_start || 0);
      const status = String(appointment?.status || '').toUpperCase();
      return start >= now && start <= next24h && status !== 'CANCELLED';
    });
    const nextAppointmentStart = upcomingAppointments.length
      ? Math.min(...upcomingAppointments.map((appointment: any) => Number(appointment?.scheduled_start || 0)))
      : null;

    const actions: QuickAction[] = [];
    if (unanswered > 0) {
      actions.push({
        id: 'unanswered_questions',
        title: 'Unanswered questions',
        description: 'Review caller questions that still need an answer.',
        severity: unanswered > 10 ? 'HIGH' : 'MEDIUM',
        count: unanswered,
        action_url: '/dashboard/knowledge?tab=flagged',
      });
    }
    if (hotLeads > 0) {
      actions.push({
        id: 'hot_leads',
        title: 'Hot leads need follow-up',
        description: 'Recent leads are waiting for outreach.',
        severity: hotLeads > 15 ? 'HIGH' : 'MEDIUM',
        count: hotLeads,
        action_url: '/dashboard/customers',
      });
    }
    if (upcomingAppointments.length > 0) {
      actions.push({
        id: 'upcoming_appointments',
        title: 'Appointments in the next 24h',
        description: 'Prepare for upcoming jobs and confirmations.',
        severity: 'LOW',
        count: upcomingAppointments.length,
        action_url: '/dashboard/appointments',
      });
    }

    return {
      unanswered_questions: unanswered,
      hot_leads_needing_follow_up: hotLeads,
      appointments_next_24h: upcomingAppointments.length,
      next_appointment_countdown_minutes:
        nextAppointmentStart && nextAppointmentStart > now
          ? Math.max(0, Math.round((nextAppointmentStart - now) / 60000))
          : null,
      quick_actions: actions,
    };
  }

  async getActivityFeed(companyId: string, limit = 25): Promise<ActivityFeedItem[]> {
    const [calls, appointments, contacts, payments] = await Promise.all([
      this.scanByCompany('calls', companyId, 150),
      this.scanByCompany('appointments', companyId, 150),
      this.scanByCompany('contacts', companyId, 150),
      this.scanByCompany('customer_payments', companyId, 150),
    ]);

    const callItems: ActivityFeedItem[] = calls.map((call: any) => ({
      id: `call:${call.call_id || call.id || Math.random().toString(36).slice(2)}`,
      type: 'CALL',
      title: 'New call',
      description: `${call.caller_name || call.from_number || 'Unknown caller'} completed a call`,
      created_at: Number(call.started_at || call.created_at || 0),
      action_url: '/dashboard/calls',
    }));

    const appointmentItems: ActivityFeedItem[] = appointments.map((appointment: any) => ({
      id: `appointment:${appointment.appointment_id || Math.random().toString(36).slice(2)}`,
      type: 'APPOINTMENT',
      title: 'Appointment activity',
      description: `${appointment.contact_name || appointment.contact_phone || 'Customer'} · ${appointment.service_type || 'Service'}`,
      created_at: Number(appointment.updated_at || appointment.created_at || 0),
      action_url: '/dashboard/appointments',
    }));

    const leadItems: ActivityFeedItem[] = contacts.map((contact: any) => ({
      id: `lead:${contact.contact_id || Math.random().toString(36).slice(2)}`,
      type: 'LEAD',
      title: 'New lead',
      description: `${contact.name || contact.phone_number || contact.phone || 'Lead'} was added`,
      created_at: Number(contact.created_at || contact.updated_at || 0),
      action_url: '/dashboard/customers',
    }));

    const paymentItems: ActivityFeedItem[] = payments.map((payment: any) => ({
      id: `payment:${payment.payment_id || Math.random().toString(36).slice(2)}`,
      type: 'PAYMENT',
      title: 'Payment update',
      description: `${this.formatMoney(Number(payment.amount_cents || 0), String(payment.currency || 'usd'))} · ${String(payment.payment_status || 'UNKNOWN')}`,
      created_at: Number(payment.paid_at || payment.updated_at || payment.created_at || 0),
      action_url: '/dashboard/payments',
    }));

    return [...callItems, ...appointmentItems, ...leadItems, ...paymentItems]
      .filter((item) => Number.isFinite(item.created_at) && item.created_at > 0)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Legacy endpoints kept to avoid breaking existing clients while migrating.
  // ---------------------------------------------------------------------------
  async getStats(companyId: string): Promise<DashboardStats> {
    const todayStart = this.getDayStartUtc(Date.now());
    const [calls, contacts, appointments, flagged] = await Promise.all([
      this.scanByCompany('calls', companyId, 500),
      this.scanByCompany('contacts', companyId, 500),
      this.scanByCompany('appointments', companyId, 500),
      this.scanByCompany('flagged_questions', companyId, 500),
    ]);

    return {
      todayCalls: calls.filter((call: any) => Number(call?.started_at || call?.created_at || 0) >= todayStart).length,
      newLeads: contacts.filter((contact: any) => Number(contact?.created_at || 0) >= todayStart).length,
      appointments: appointments.filter((appointment: any) => {
        const start = Number(appointment?.scheduled_start || 0);
        const status = String(appointment?.status || '').toUpperCase();
        return start >= todayStart && status !== 'CANCELLED';
      }).length,
      pendingQuestions: flagged.filter((item: any) => {
        const status = String(item?.status || '').toUpperCase();
        return status === 'PENDING' || status === 'OPEN';
      }).length,
    };
  }

  async getRecentCalls(companyId: string, limit = 5): Promise<RecentCall[]> {
    const calls = await this.scanByCompany('calls', companyId, 200);
    return calls
      .sort((a: any, b: any) => Number(b?.started_at || b?.created_at || 0) - Number(a?.started_at || a?.created_at || 0))
      .slice(0, limit)
      .map((call: any) => ({
        call_id: String(call.call_id || ''),
        caller_phone: call.from_number || call.caller_phone || 'Unknown',
        caller_name: call.caller_name,
        created_at: new Date(Number(call.started_at || call.created_at || Date.now())).toISOString(),
        duration: call.duration_seconds || call.duration,
        status: call.status || 'UNKNOWN',
        summary: call.summary,
      }));
  }

  async getUpcomingAppointments(companyId: string, limit = 5): Promise<UpcomingAppointment[]> {
    const now = Date.now();
    const appointments = await this.scanByCompany('appointments', companyId, 300);
    return appointments
      .filter((appointment: any) => {
        const start = Number(appointment?.scheduled_start || 0);
        const status = String(appointment?.status || '').toUpperCase();
        return start >= now && status !== 'CANCELLED';
      })
      .sort((a: any, b: any) => Number(a?.scheduled_start || 0) - Number(b?.scheduled_start || 0))
      .slice(0, limit)
      .map((appointment: any) => ({
        appointment_id: String(appointment.appointment_id || ''),
        contact_name: appointment.contact_name || 'Customer',
        contact_phone: appointment.contact_phone || '',
        scheduled_time: new Date(Number(appointment.scheduled_start || Date.now())).toISOString(),
        service_type: appointment.service_type,
        status: appointment.status || 'SCHEDULED',
      }));
  }

  private async scanByCompany(table: string, companyId: string, limit: number): Promise<any[]> {
    try {
      const result = await this.dynamodb.scan(table, {
        filterExpression: '#company_id = :company_id',
        expressionAttributeNames: {
          '#company_id': 'company_id',
        },
        expressionAttributeValues: {
          ':company_id': companyId,
        },
        limit,
      });
      return result.items || [];
    } catch (error) {
      if (!this.isResourceNotFoundError(error)) throw error;
      console.warn(`[DashboardService] Table missing for scan (${table}). Returning empty data.`);
      return [];
    }
  }

  private getDayStartUtc(timestamp: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  private getWeekStartUtc(timestamp: number): number {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
    monday.setUTCHours(0, 0, 0, 0);
    return monday.getTime();
  }

  private getMonthStartUtc(timestamp: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }

  private formatMoney(cents: number, currency: string): string {
    const amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }
}

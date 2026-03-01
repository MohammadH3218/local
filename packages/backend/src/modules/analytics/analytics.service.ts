import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  async getCallMetrics(companyId: string, options?: { days?: number }) {
    const days = options?.days || 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = await this.dynamodb.scan('calls', {
      filterExpression: '#company_id = :company_id AND #created_at >= :since',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#created_at': 'created_at',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':since': since,
      },
      limit: 500,
    });

    const calls = (result.items || []) as any[];

    // Aggregate metrics
    const total = calls.length;
    const completed = calls.filter((c) => c.status === 'completed').length;
    const withLead = calls.filter((c) => c.lead_captured === true).length;
    const withAppointment = calls.filter((c) => c.appointment_created === true).length;
    const inbound = calls.filter((c) => !c.direction || c.direction === 'INBOUND').length;
    const outbound = calls.filter((c) => c.direction === 'OUTBOUND').length;

    const durations = calls.filter((c) => c.duration > 0).map((c) => Number(c.duration || 0));
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    const sentimentCounts = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    for (const c of calls) {
      const s = String(c.sentiment || 'unknown').toLowerCase();
      if (s.includes('positive')) sentimentCounts.positive++;
      else if (s.includes('negative')) sentimentCounts.negative++;
      else if (s.includes('neutral')) sentimentCounts.neutral++;
      else sentimentCounts.unknown++;
    }

    // Daily breakdown (last days)
    const dailyMap: Record<string, { calls: number; leads: number; bookings: number }> = {};
    for (const c of calls) {
      const date = new Date(Number(c.created_at)).toISOString().split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { calls: 0, leads: 0, bookings: 0 };
      dailyMap[date].calls++;
      if (c.lead_captured) dailyMap[date].leads++;
      if (c.appointment_created) dailyMap[date].bookings++;
    }

    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Lead quality breakdown
    const qualityCounts: Record<string, number> = {};
    for (const c of calls) {
      const q = String(c.lead_quality || 'unknown');
      qualityCounts[q] = (qualityCounts[q] || 0) + 1;
    }

    return {
      period_days: days,
      total_calls: total,
      completed_calls: completed,
      completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      lead_capture_rate: total > 0 ? Math.round((withLead / total) * 100) : 0,
      booking_conversion_rate: total > 0 ? Math.round((withAppointment / total) * 100) : 0,
      inbound_calls: inbound,
      outbound_calls: outbound,
      avg_duration_seconds: avgDuration,
      sentiment: sentimentCounts,
      lead_quality: qualityCounts,
      daily_breakdown: daily,
    };
  }

  async getSmsMetrics(companyId: string, options?: { days?: number }) {
    const days = options?.days || 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = await this.dynamodb.scan('sms', {
      filterExpression: '#company_id = :company_id AND #created_at >= :since',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#created_at': 'created_at',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':since': since,
      },
      limit: 500,
    });

    const messages = (result.items || []) as any[];
    const total = messages.length;
    const inbound = messages.filter((m) => m.direction === 'INBOUND' || m.direction === 'inbound').length;
    const outbound = messages.filter((m) => m.direction === 'OUTBOUND' || m.direction === 'outbound').length;

    return {
      period_days: days,
      total_messages: total,
      inbound_messages: inbound,
      outbound_messages: outbound,
    };
  }

  async getLeadMetrics(companyId: string, options?: { days?: number }) {
    const days = options?.days || 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id AND #created_at >= :since',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#created_at': 'created_at',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':since': since,
      },
      limit: 500,
    });

    const contacts = (result.items || []) as any[];
    const statusCounts: Record<string, number> = {};
    for (const c of contacts) {
      const s = String(c.lead_status || 'UNKNOWN');
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return {
      period_days: days,
      new_leads: contacts.length,
      by_status: statusCounts,
    };
  }
}

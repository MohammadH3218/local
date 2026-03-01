import { Injectable } from '@nestjs/common';
import { PLAN_FEATURES, SubscriptionPlan } from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { TelephonyService } from '../telephony/telephony.service';

@Injectable()
export class FollowUpSequencesService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
    private readonly telephony: TelephonyService,
  ) {}

  async scheduleAfterCall(params: {
    company_id: string;
    contact_id?: string;
    contact_phone?: string;
    contact_name?: string;
    booking_link?: string;
  }): Promise<void> {
    const company = await this.companies.findById(params.company_id);
    if (!company) return;

    const plan = this.resolvePlan(company.subscription_plan);
    if (!PLAN_FEATURES[plan].follow_up_sequences) return;
    if (!company.follow_up_sequences_enabled) return;
    if (!params.contact_phone) return;

    const now = Date.now();
    const companyName = company.company_name || 'our team';
    const bookingLink = params.booking_link || '';
    const templates = [
      {
        delayMinutes: this.resolveDelayMinutes(company.follow_up_initial_delay_minutes, 0),
        body: this.renderTemplate(
          company.follow_up_initial_template ||
            "Thanks for calling {{company_name}}! Here's your booking link: {{booking_link}}",
          {
            company_name: companyName,
            booking_link: bookingLink,
            contact_name: params.contact_name || 'there',
          },
        ),
      },
      {
        delayMinutes: this.resolveDelayMinutes(company.follow_up_second_delay_minutes, 24 * 60),
        body: this.renderTemplate(
          company.follow_up_second_template ||
            "Haven't booked yet? We'd love to help. {{booking_link}}",
          {
            company_name: companyName,
            booking_link: bookingLink,
            contact_name: params.contact_name || 'there',
          },
        ),
      },
      {
        delayMinutes: this.resolveDelayMinutes(company.follow_up_final_delay_minutes, 3 * 24 * 60),
        body: this.renderTemplate(
          company.follow_up_final_template ||
            "Final follow-up from {{company_name}}. Reply here if you'd like us to reserve a time for you.",
          {
            company_name: companyName,
            booking_link: bookingLink,
            contact_name: params.contact_name || 'there',
          },
        ),
      },
    ].filter((step) => Boolean(step.body));

    const sequenceId = uuidv4();
    const sequenceSteps = templates.map((template, index) => ({
      step: index + 1,
      send_at: now + template.delayMinutes * 60 * 1000,
      body: template.body,
    }));

    await this.dynamodb.put('follow_up_sequences', {
      company_id: params.company_id,
      sequence_id: sequenceId,
      contact_id: params.contact_id,
      to_number: params.contact_phone,
      status: 'SCHEDULED',
      steps: sequenceSteps,
      created_at: now,
      updated_at: now,
    });

    for (const template of sequenceSteps) {
      await this.dynamodb.put('scheduled_messages', {
        company_id: params.company_id,
        message_id: `${template.send_at}-${uuidv4()}`,
        sequence_id: sequenceId,
        contact_id: params.contact_id,
        to_number: params.contact_phone,
        channel: 'SMS',
        message_type: 'FOLLOW_UP',
        body: template.body,
        send_at: template.send_at,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });
    }
  }

  async scheduleReviewRequest(params: {
    company_id: string;
    contact_id?: string;
    contact_phone?: string;
    contact_name?: string;
    appointment_id?: string;
  }): Promise<void> {
    const company = await this.companies.findById(params.company_id);
    if (!company) return;
    if (!company.review_request_enabled) return;
    if (!company.review_platform_url) return;
    if (!params.contact_phone) return;

    const duplicate = await this.hasExistingReviewRequest(
      params.company_id,
      params.appointment_id,
      params.contact_id,
      params.contact_phone,
    );
    if (duplicate) return;

    const now = Date.now();
    const delayMinutes = Number(company.review_request_delay_minutes || 120);
    const sendAt = now + Math.max(0, delayMinutes) * 60 * 1000;
    const message = this.renderTemplate(
      company.review_request_template ||
        "Thanks for choosing {{company_name}}! We'd love your feedback: {{review_link}}",
      {
        company_name: company.company_name || 'our team',
        review_link: company.review_platform_url,
        contact_name: params.contact_name || 'there',
      },
    );

    await this.dynamodb.put('scheduled_messages', {
      company_id: params.company_id,
      message_id: `${sendAt}-${uuidv4()}`,
      contact_id: params.contact_id,
      appointment_id: params.appointment_id,
      to_number: params.contact_phone,
      channel: 'SMS',
      message_type: 'REVIEW_REQUEST',
      body: message,
      send_at: sendAt,
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    });
  }

  async processDueMessages(max = 100): Promise<{ processed: number; sent: number; failed: number }> {
    const now = Date.now();
    const scan = await this.dynamodb.scan('scheduled_messages', {
      filterExpression: '#send_at <= :now AND #status = :pending',
      expressionAttributeNames: {
        '#send_at': 'send_at',
        '#status': 'status',
      },
      expressionAttributeValues: {
        ':now': now,
        ':pending': 'PENDING',
      },
      limit: max,
    });

    let sent = 0;
    let failed = 0;
    for (const item of scan.items || []) {
      const companyId = String((item as any).company_id || '');
      const messageId = String((item as any).message_id || '');
      const toNumber = String((item as any).to_number || '');
      const body = String((item as any).body || '');
      if (!companyId || !messageId || !toNumber || !body) continue;

      try {
        await this.telephony.sendSms(toNumber, body);
        await this.dynamodb.update(
          'scheduled_messages',
          { company_id: companyId, message_id: messageId },
          { status: 'SENT', sent_at: Date.now(), updated_at: Date.now() },
        );
        sent += 1;
      } catch (error: any) {
        await this.dynamodb.update(
          'scheduled_messages',
          { company_id: companyId, message_id: messageId },
          { status: 'FAILED', error: error?.message || 'Delivery failed', updated_at: Date.now() },
        );
        failed += 1;
      }
    }

    return {
      processed: (scan.items || []).length,
      sent,
      failed,
    };
  }

  private resolvePlan(raw?: string | null): SubscriptionPlan {
    const candidate = String(raw || '').toUpperCase();
    if (Object.values(SubscriptionPlan).includes(candidate as SubscriptionPlan)) {
      return candidate as SubscriptionPlan;
    }
    return SubscriptionPlan.STARTER;
  }

  private resolveDelayMinutes(raw: any, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.round(parsed));
  }

  private renderTemplate(template: string, values: Record<string, string>): string {
    let rendered = String(template || '').trim();
    for (const [key, value] of Object.entries(values)) {
      const safe = String(value || '').trim();
      rendered = rendered.split(`{{${key}}}`).join(safe);
      rendered = rendered.split(`[${key}]`).join(safe);
    }
    return rendered.replace(/\s+/g, ' ').trim();
  }

  private async hasExistingReviewRequest(
    companyId: string,
    appointmentId?: string,
    contactId?: string,
    toNumber?: string,
  ): Promise<boolean> {
    const scan = await this.dynamodb.scan('scheduled_messages', {
      filterExpression: '#company_id = :company_id AND #message_type = :message_type',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#message_type': 'message_type',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':message_type': 'REVIEW_REQUEST',
      },
      limit: 200,
    });

    for (const item of scan.items || []) {
      const status = String((item as any).status || '').toUpperCase();
      if (status && status === 'FAILED') continue;
      if (appointmentId && String((item as any).appointment_id || '') === appointmentId) {
        return true;
      }
      if (!appointmentId && contactId && String((item as any).contact_id || '') === contactId) {
        return true;
      }
      if (!appointmentId && !contactId && toNumber && String((item as any).to_number || '') === toNumber) {
        return true;
      }
    }
    return false;
  }

  // ──── USER-FACING SEQUENCE & SETTINGS METHODS ────────────────────────────

  async listSequences(companyId: string) {
    const result = await this.dynamodb.scan('follow_up_sequences', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: { '#company_id': 'company_id' },
      expressionAttributeValues: { ':company_id': companyId },
      limit: 100,
    });
    return result.items || [];
  }

  async getSettings(companyId: string) {
    const company = await this.companies.findById(companyId);
    if (!company) return null;
    return {
      follow_up_sequences_enabled: company.follow_up_sequences_enabled ?? false,
      follow_up_initial_delay_minutes: company.follow_up_initial_delay_minutes ?? 0,
      follow_up_second_delay_minutes: company.follow_up_second_delay_minutes ?? 1440,
      follow_up_final_delay_minutes: company.follow_up_final_delay_minutes ?? 4320,
      follow_up_initial_template: company.follow_up_initial_template ?? '',
      follow_up_second_template: company.follow_up_second_template ?? '',
      follow_up_final_template: company.follow_up_final_template ?? '',
      review_request_enabled: company.review_request_enabled ?? false,
      review_request_delay_minutes: company.review_request_delay_minutes ?? 120,
      review_platform_url: company.review_platform_url ?? '',
      review_request_template: company.review_request_template ?? '',
    };
  }

  async updateSettings(
    companyId: string,
    updates: {
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
    },
  ) {
    await this.companies.updateCompany(companyId, updates);
    return this.getSettings(companyId);
  }
}

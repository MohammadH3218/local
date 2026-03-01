import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CustomerPayment, CustomerPaymentStatus, CustomerPaymentType } from '@handycall/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

type PaymentFilters = {
  status?: CustomerPaymentStatus;
  type?: CustomerPaymentType;
  contact_id?: string;
  start?: number;
  end?: number;
  limit?: number;
  lastEvaluatedKey?: any;
};

@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly notifications: NotificationsService,
  ) {}

  private isResourceNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const maybe = error as { name?: string; message?: string };
    return (
      maybe.name === 'ResourceNotFoundException' ||
      String(maybe.message || '').includes('Requested resource not found')
    );
  }

  async createPayment(
    companyId: string,
    input: Omit<CustomerPayment, 'company_id' | 'payment_id' | 'created_at' | 'updated_at'> & {
      payment_id?: string;
    },
  ): Promise<CustomerPayment> {
    const now = Date.now();
    const payment: CustomerPayment = {
      company_id: companyId,
      payment_id: input.payment_id || uuidv4(),
      contact_id: input.contact_id,
      appointment_id: input.appointment_id,
      customer_name: input.customer_name,
      customer_email: input.customer_email,
      service_name: input.service_name,
      payment_type: input.payment_type,
      payment_status: input.payment_status,
      amount_cents: input.amount_cents,
      currency: input.currency || 'usd',
      stripe_payment_intent_id: input.stripe_payment_intent_id,
      stripe_charge_id: input.stripe_charge_id,
      metadata: input.metadata,
      created_at: now,
      updated_at: now,
      paid_at: input.paid_at,
    };
    await this.dynamodb.put('customer_payments', {
      ...(payment as any),
      company_contact: payment.contact_id ? `${companyId}#${payment.contact_id}` : undefined,
    });
    await this.notifications.emitPaymentPosted(companyId, payment).catch((err) => {
      console.warn('[CustomerPaymentsService] Failed to emit payment notification', err?.message || err);
    });
    return payment;
  }

  async getPaymentById(companyId: string, paymentId: string): Promise<CustomerPayment | null> {
    try {
      const payment = await this.dynamodb.get('customer_payments', {
        company_id: companyId,
        payment_id: paymentId,
      });
      return (payment as CustomerPayment) || null;
    } catch (error) {
      if (!this.isResourceNotFoundError(error)) throw error;
      return null;
    }
  }

  async updatePayment(
    companyId: string,
    paymentId: string,
    updates: Partial<CustomerPayment>,
  ): Promise<CustomerPayment | null> {
    const existing = await this.dynamodb.get('customer_payments', {
      company_id: companyId,
      payment_id: paymentId,
    });
    if (!existing) return null;

    const next = await this.dynamodb.update(
      'customer_payments',
      { company_id: companyId, payment_id: paymentId },
      {
        ...updates,
        ...(updates.contact_id ? { company_contact: `${companyId}#${updates.contact_id}` } : {}),
        updated_at: Date.now(),
      },
    );
    return (next || { ...existing, ...updates }) as CustomerPayment;
  }

  async getPaymentsByCompany(
    companyId: string,
    filters?: PaymentFilters,
  ): Promise<{ payments: CustomerPayment[]; lastEvaluatedKey?: any }> {
    const limit = Math.min(Math.max(Number(filters?.limit || 50), 1), 200);
    const start = typeof filters?.start === 'number' ? filters.start : null;
    const end = typeof filters?.end === 'number' ? filters.end : null;
    const status = filters?.status;
    const type = filters?.type;
    const contactId = filters?.contact_id;

    const collected: CustomerPayment[] = [];
    let cursor: any = filters?.lastEvaluatedKey;
    let pages = 0;
    const maxPages = 10;

    while (collected.length < limit && pages < maxPages) {
      pages += 1;

      let items: any[] = [];
      let nextCursor: any = undefined;

      try {
        const page = await this.dynamodb.queryByCompany(
          'customer_payments',
          companyId,
          {},
          {
            indexName: 'date-index',
            limit: Math.max(limit * 2, 50),
            scanIndexForward: false,
            exclusiveStartKey: cursor,
          },
        );
        items = page.items || [];
        nextCursor = page.lastEvaluatedKey;
      } catch {
        // Fallback for environments where the date GSI has not been created yet.
        try {
          const page = await this.dynamodb.scan('customer_payments', {
            filterExpression: '#company_id = :company_id',
            expressionAttributeNames: {
              '#company_id': 'company_id',
            },
            expressionAttributeValues: {
              ':company_id': companyId,
            },
            limit: Math.max(limit * 2, 200),
            exclusiveStartKey: cursor,
          });
          items = page.items || [];
          nextCursor = page.lastEvaluatedKey;
        } catch (scanError) {
          if (!this.isResourceNotFoundError(scanError)) throw scanError;
          console.warn('[CustomerPaymentsService] customer_payments table missing. Returning empty payments.');
          return { payments: [] };
        }
      }

      for (const item of items) {
        if (status && item.payment_status !== status) continue;
        if (type && item.payment_type !== type) continue;
        if (contactId && item.contact_id !== contactId) continue;
        const createdAt = Number(item.created_at || 0);
        if (start !== null && createdAt < start) continue;
        if (end !== null && createdAt > end) continue;
        collected.push(item as CustomerPayment);
        if (collected.length >= limit) break;
      }

      cursor = nextCursor;
      if (!cursor || items.length === 0) break;
    }

    const filtered = collected
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
      .slice(0, limit);

    return {
      payments: filtered,
      lastEvaluatedKey: cursor,
    };
  }

  async getPaymentsByContact(
    companyId: string,
    contactId: string,
    options?: { limit?: number; start?: number; end?: number },
  ): Promise<CustomerPayment[]> {
    const result = await this.getPaymentsByCompany(companyId, {
      contact_id: contactId,
      limit: options?.limit || 100,
      start: options?.start,
      end: options?.end,
    });
    return result.payments;
  }

  async getRevenueStats(
    companyId: string,
    options?: { start?: number; end?: number },
  ): Promise<{
    total_revenue_cents: number;
    successful_payments: number;
    pending_payments: number;
    failed_payments: number;
    average_ticket_cents: number;
    last_30_days_revenue_cents: number;
    this_month_revenue_cents: number;
  }> {
    const now = Date.now();
    const start = typeof options?.start === 'number' ? options.start : 0;
    const end = typeof options?.end === 'number' ? options.end : now;
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const monthStart = startOfMonth.getTime();
    const last30 = now - 30 * 24 * 60 * 60 * 1000;

    let scan: { items: any[] } = { items: [] };
    try {
      scan = await this.dynamodb.scan('customer_payments', {
        filterExpression: '#company_id = :company_id',
        expressionAttributeNames: {
          '#company_id': 'company_id',
        },
        expressionAttributeValues: {
          ':company_id': companyId,
        },
        limit: 1000,
      });
    } catch (error) {
      if (!this.isResourceNotFoundError(error)) throw error;
      console.warn('[CustomerPaymentsService] customer_payments table missing. Returning zeroed revenue stats.');
    }

    const payments = (scan.items || []) as CustomerPayment[];
    let totalRevenue = 0;
    let successCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let last30Days = 0;
    let thisMonth = 0;

    for (const payment of payments) {
      const paidAt = Number(payment.paid_at || payment.created_at || 0);
      const createdAt = Number(payment.created_at || 0);
      if (createdAt < start || createdAt > end) continue;

      const amount = Number(payment.amount_cents || 0);
      if (payment.payment_status === 'SUCCEEDED') {
        totalRevenue += amount;
        successCount += 1;
        if (paidAt >= last30) last30Days += amount;
        if (paidAt >= monthStart) thisMonth += amount;
      } else if (
        payment.payment_status === 'PROCESSING' ||
        payment.payment_status === 'REQUIRES_CONFIRMATION' ||
        payment.payment_status === 'REQUIRES_PAYMENT_METHOD'
      ) {
        pendingCount += 1;
      } else if (payment.payment_status === 'FAILED' || payment.payment_status === 'CANCELED') {
        failedCount += 1;
      }
    }

    return {
      total_revenue_cents: totalRevenue,
      successful_payments: successCount,
      pending_payments: pendingCount,
      failed_payments: failedCount,
      average_ticket_cents: successCount > 0 ? Math.round(totalRevenue / successCount) : 0,
      last_30_days_revenue_cents: last30Days,
      this_month_revenue_cents: thisMonth,
    };
  }

  async syncFromPaymentIntent(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const metadata = paymentIntent.metadata || {};
    const companyId = metadata.company_id;
    const paymentId = metadata.payment_id;
    if (!companyId || !paymentId) return;

    const statusMap: Record<string, CustomerPaymentStatus> = {
      requires_payment_method: 'REQUIRES_PAYMENT_METHOD',
      requires_confirmation: 'REQUIRES_CONFIRMATION',
      processing: 'PROCESSING',
      succeeded: 'SUCCEEDED',
      canceled: 'CANCELED',
    };

    const mappedStatus = statusMap[paymentIntent.status] || 'FAILED';
    const latestCharge =
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

    await this.updatePayment(companyId, paymentId, {
      payment_status: mappedStatus,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: latestCharge || undefined,
      paid_at: mappedStatus === 'SUCCEEDED' ? Date.now() : undefined,
    });

    const appointmentId = metadata.appointment_id;
    if (!appointmentId) return;

    try {
      await this.dynamodb.update(
        'appointments',
        { company_id: companyId, appointment_id: appointmentId },
        {
          payment_status:
            mappedStatus === 'SUCCEEDED'
              ? 'PAID'
              : mappedStatus === 'FAILED' || mappedStatus === 'CANCELED'
                ? 'FAILED'
                : 'PENDING',
          payment_id: paymentId,
          amount_paid_cents: mappedStatus === 'SUCCEEDED' ? paymentIntent.amount : 0,
          updated_at: Date.now(),
        },
      );
    } catch {
      // Best effort: payment record should still be synced even if appointment update fails.
    }
  }
}

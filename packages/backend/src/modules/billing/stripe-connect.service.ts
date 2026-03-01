import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import Stripe from 'stripe';
import { CustomerPaymentsService } from './customer-payments.service';

type ConnectStatus = {
  connected: boolean;
  account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements_due?: string[];
  disabled_reason?: string | null;
};

@Injectable()
export class StripeConnectService {
  private readonly stripe: Stripe;

  constructor(
    private readonly config: ConfigService,
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
    private readonly customerPayments: CustomerPaymentsService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  private mapConnectSetupError(error: any): BadRequestException {
    const raw = String(error?.message || '').trim();
    const lower = raw.toLowerCase();

    if (
      lower.includes("you can only create new accounts if you've signed up for connect") ||
      lower.includes('signed up for connect')
    ) {
      return new BadRequestException(
        'Stripe Connect is not enabled on your Stripe account yet. In Stripe Dashboard, open Connect and complete "Get started", then try again.',
      );
    }

    if (lower.includes('api key') || lower.includes('invalid api key')) {
      return new BadRequestException(
        'Stripe API key is invalid or not authorized for Connect. Verify STRIPE_SECRET_KEY in backend environment.',
      );
    }

    if (lower.includes('no such account')) {
      return new BadRequestException(
        'Saved Stripe Connect account could not be found for the current Stripe key. Re-run Connect setup to create a new linked account.',
      );
    }

    if (lower.includes('requested resource not found') || lower.includes('resource_missing')) {
      return new BadRequestException(
        'Stripe Connect setup could not find the required Stripe resource. We reset stale IDs automatically; please click "Set up Connect" again.',
      );
    }

    return new BadRequestException(raw || 'Unable to start Stripe Connect onboarding.');
  }

  private isMissingConnectAccountError(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const type = String(error?.type || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'resource_missing' ||
      (type.includes('invalid_request') && message.includes('no such account')) ||
      message.includes('no such account') ||
      message.includes('requested resource not found')
    );
  }

  async createConnectedAccount(companyId: string): Promise<{ account_id: string }> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (company.stripe_connect_account_id) {
      try {
        const existingAccount = await this.stripe.accounts.retrieve(company.stripe_connect_account_id);
        await this.upsertConnectedAccount(companyId, existingAccount);
        return { account_id: existingAccount.id };
      } catch (error: any) {
        if (!this.isMissingConnectAccountError(error)) {
          throw this.mapConnectSetupError(error);
        }
        await this.companies.updateCompany(companyId, {
          stripe_connect_account_id: null as any,
          stripe_connect_onboarding_complete: false,
        } as any);
      }
    }

    let account: Stripe.Account;
    try {
      account = await this.stripe.accounts.create({
        type: 'express',
        business_type: 'company',
        email: company.email || undefined,
        metadata: {
          company_id: companyId,
        },
      });
    } catch (error: any) {
      throw this.mapConnectSetupError(error);
    }

    await this.companies.updateCompany(companyId, {
      stripe_connect_account_id: account.id,
      stripe_connect_onboarding_complete: false,
    } as any);

    await this.upsertConnectedAccount(companyId, account);
    return { account_id: account.id };
  }

  async createAccountLink(
    companyId: string,
    options?: { refresh_url?: string; return_url?: string },
  ): Promise<{ account_id: string; url: string; expires_at: number }> {
    let { account_id } = await this.createConnectedAccount(companyId);

    const frontendBase = (this.config.get<string>('FRONTEND_URL') || 'https://handycall.org').replace(/\/$/, '');
    const refresh_url =
      options?.refresh_url || `${frontendBase}/dashboard/settings?payments=connect&state=refresh`;
    const return_url =
      options?.return_url || `${frontendBase}/dashboard/settings?payments=connect&state=return`;

    let link: Stripe.AccountLink;
    try {
      link = await this.stripe.accountLinks.create({
        account: account_id,
        type: 'account_onboarding',
        refresh_url,
        return_url,
      });
    } catch (error: any) {
      // Recover from stale/deleted account IDs by recreating once.
      if (this.isMissingConnectAccountError(error)) {
        await this.companies.updateCompany(companyId, {
          stripe_connect_account_id: null as any,
          stripe_connect_onboarding_complete: false,
        } as any);
        const recreated = await this.createConnectedAccount(companyId);
        account_id = recreated.account_id;
        try {
          link = await this.stripe.accountLinks.create({
            account: account_id,
            type: 'account_onboarding',
            refresh_url,
            return_url,
          });
        } catch (retryError: any) {
          throw this.mapConnectSetupError(retryError);
        }
      } else {
        throw this.mapConnectSetupError(error);
      }
    }

    return {
      account_id,
      url: link.url,
      expires_at: link.expires_at * 1000,
    };
  }

  async getAccountStatus(companyId: string): Promise<ConnectStatus> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (!company.stripe_connect_account_id) {
      return { connected: false };
    }

    let account: Stripe.Account;
    try {
      account = await this.stripe.accounts.retrieve(company.stripe_connect_account_id);
    } catch (error: any) {
      if (this.isMissingConnectAccountError(error)) {
        await this.companies.updateCompany(companyId, {
          stripe_connect_account_id: null as any,
          stripe_connect_onboarding_complete: false,
        } as any);
        return { connected: false };
      }
      throw this.mapConnectSetupError(error);
    }
    await this.upsertConnectedAccount(companyId, account);

    const onboardingComplete = Boolean(account.details_submitted && account.charges_enabled);
    if (company.stripe_connect_onboarding_complete !== onboardingComplete) {
      await this.companies.updateCompany(companyId, {
        stripe_connect_onboarding_complete: onboardingComplete,
      } as any);
    }

    return {
      connected: true,
      account_id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements_due: account.requirements?.currently_due || [],
      disabled_reason: account.requirements?.disabled_reason || null,
    };
  }

  async createPaymentIntent(
    companyId: string,
    input: {
      amount_cents: number;
      currency?: string;
      metadata?: Record<string, string>;
      description?: string;
      customer_email?: string;
    },
  ): Promise<Stripe.PaymentIntent> {
    if (!Number.isFinite(input.amount_cents) || input.amount_cents < 50) {
      throw new BadRequestException('amount_cents must be at least 50');
    }

    const status = await this.getAccountStatus(companyId);
    if (!status.connected || !status.account_id) {
      throw new BadRequestException('Stripe Connect account is not set up');
    }
    if (!status.charges_enabled) {
      throw new BadRequestException('Stripe Connect onboarding is incomplete. Charges are not enabled yet.');
    }

    const currency = (input.currency || 'usd').toLowerCase();
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(input.amount_cents),
      currency,
      description: input.description,
      receipt_email: input.customer_email || undefined,
      automatic_payment_methods: { enabled: true },
      transfer_data: {
        destination: status.account_id,
      },
      on_behalf_of: status.account_id,
      metadata: {
        company_id: companyId,
        ...(input.metadata || {}),
      },
    });

    return paymentIntent;
  }

  async createSubscriptionCheckoutSession(
    companyId: string,
    input: {
      amount_cents: number;
      currency?: string;
      service_name: string;
      customer_email?: string;
      metadata?: Record<string, string>;
      interval?: 'day' | 'week' | 'month' | 'year';
      interval_count?: number;
      trial_period_days?: number;
      success_url?: string;
      cancel_url?: string;
    },
  ): Promise<Stripe.Checkout.Session> {
    if (!Number.isFinite(input.amount_cents) || input.amount_cents < 50) {
      throw new BadRequestException('amount_cents must be at least 50');
    }

    const status = await this.getAccountStatus(companyId);
    if (!status.connected || !status.account_id) {
      throw new BadRequestException('Stripe Connect account is not set up');
    }
    if (!status.charges_enabled) {
      throw new BadRequestException('Stripe Connect onboarding is incomplete. Charges are not enabled yet.');
    }

    const currency = (input.currency || 'usd').toLowerCase();
    const interval = input.interval || 'month';
    const intervalCount = Math.max(1, Math.floor(Number(input.interval_count || 1)));
    const trialPeriodDays = Math.max(0, Math.floor(Number(input.trial_period_days || 0)));
    const frontendBase = (this.config.get<string>('FRONTEND_URL') || 'https://handycall.org').replace(/\/$/, '');
    const successUrl = input.success_url || `${frontendBase}/dashboard/payments?checkout=success`;
    const cancelUrl = input.cancel_url || `${frontendBase}/dashboard/payments?checkout=cancel`;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: input.customer_email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(input.amount_cents),
            product_data: {
              name: input.service_name || 'Service subscription',
            },
            recurring: {
              interval,
              interval_count: intervalCount,
            },
          },
        },
      ],
      subscription_data: {
        transfer_data: {
          destination: status.account_id,
        },
        metadata: {
          company_id: companyId,
          ...(input.metadata || {}),
        },
        ...(trialPeriodDays > 0 ? { trial_period_days: trialPeriodDays } : {}),
      },
      metadata: {
        company_id: companyId,
        ...(input.metadata || {}),
      },
    });

    return session;
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    if (!sessionId?.trim()) {
      throw new BadRequestException('checkout session id is required');
    }
    return this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        'payment_intent',
        'subscription',
        'subscription.latest_invoice.payment_intent',
      ],
    });
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    if (!invoiceId?.trim()) {
      throw new BadRequestException('invoice id is required');
    }
    return this.stripe.invoices.retrieve(invoiceId, {
      expand: [
        'payment_intent',
        'payments.data.payment.payment_intent',
      ],
    });
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    if (!paymentIntentId?.trim()) {
      throw new BadRequestException('payment intent id is required');
    }
    return this.stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
  }

  private extractStripeId(value: any): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value?.id === 'string') return value.id;
    return undefined;
  }

  private extractInvoicePaymentIds(invoice: any): { paymentIntentId?: string; chargeId?: string } {
    let paymentIntentId = this.extractStripeId(invoice?.payment_intent);
    let chargeId = this.extractStripeId(invoice?.charge);

    const payments = Array.isArray(invoice?.payments?.data) ? invoice.payments.data : [];
    for (const invoicePayment of payments) {
      const payment = invoicePayment?.payment;
      if (!payment || typeof payment !== 'object') continue;

      const nestedPi = this.extractStripeId(payment.payment_intent);
      paymentIntentId = paymentIntentId || nestedPi;

      const nestedCharge = this.extractStripeId(payment.charge);
      chargeId = chargeId || nestedCharge;

      if (!chargeId && payment?.payment_intent && typeof payment.payment_intent === 'object') {
        chargeId = this.extractStripeId(payment.payment_intent.latest_charge) || chargeId;
      }

      if (paymentIntentId && chargeId) break;
    }

    return { paymentIntentId, chargeId };
  }

  async refundPayment(
    companyId: string,
    paymentId: string,
    input: {
      amount_cents?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    },
  ): Promise<{ refund_id: string; status: string; amount_cents: number }> {
    const payment = await this.customerPayments.getPaymentById(companyId, paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    let chargeId = payment.stripe_charge_id;
    let paymentIntentId = payment.stripe_payment_intent_id;

    if (!chargeId && !paymentIntentId && payment.stripe_checkout_session_id) {
      try {
        const session = await this.getCheckoutSession(payment.stripe_checkout_session_id);
        paymentIntentId = this.extractStripeId((session as any).payment_intent) || paymentIntentId;
        const sessionInvoiceId = this.extractStripeId((session as any).invoice);
        const subscription = (session as any).subscription;
        const latestInvoice = subscription && typeof subscription === 'object' ? (subscription as any).latest_invoice : null;
        const invoicePaymentIntentId = latestInvoice ? this.extractStripeId(latestInvoice.payment_intent) : undefined;
        const latestInvoiceId = latestInvoice ? this.extractStripeId(latestInvoice.id || latestInvoice) : undefined;
        paymentIntentId = paymentIntentId || invoicePaymentIntentId;
        const invoiceIdForLookup = sessionInvoiceId || latestInvoiceId;
        if ((!paymentIntentId || !chargeId) && invoiceIdForLookup) {
          try {
            const hydratedInvoice = await this.getInvoice(invoiceIdForLookup);
            const fromInvoicePayments = this.extractInvoicePaymentIds(hydratedInvoice);
            paymentIntentId = paymentIntentId || fromInvoicePayments.paymentIntentId;
            chargeId = chargeId || fromInvoicePayments.chargeId;
          } catch {
            // best-effort fallback only
          }
        }
      } catch {
        // best-effort fallback only
      }
    }

    if (!chargeId && !paymentIntentId && payment.stripe_subscription_id) {
      try {
        const subscription = await this.stripe.subscriptions.retrieve(payment.stripe_subscription_id, {
          expand: [
            'latest_invoice.payment_intent',
          ],
        });
        const latestInvoice = (subscription as any).latest_invoice;
        const invoicePaymentIntentId = latestInvoice ? this.extractStripeId(latestInvoice.payment_intent) : undefined;
        const latestInvoiceId = latestInvoice ? this.extractStripeId(latestInvoice.id || latestInvoice) : undefined;
        paymentIntentId = paymentIntentId || invoicePaymentIntentId;
        if ((!paymentIntentId || !chargeId) && latestInvoiceId) {
          try {
            const hydratedInvoice = await this.getInvoice(latestInvoiceId);
            const fromInvoicePayments = this.extractInvoicePaymentIds(hydratedInvoice);
            paymentIntentId = paymentIntentId || fromInvoicePayments.paymentIntentId;
            chargeId = chargeId || fromInvoicePayments.chargeId;
          } catch {
            // best-effort fallback only
          }
        }
      } catch {
        // best-effort fallback only
      }
    }

    if (!chargeId && paymentIntentId) {
      try {
        const paymentIntent = await this.getPaymentIntent(paymentIntentId);
        chargeId = this.extractStripeId((paymentIntent as any).latest_charge) || chargeId;
      } catch {
        // best-effort fallback only
      }
    }

    if (!chargeId && !paymentIntentId) {
      throw new BadRequestException('Payment has no Stripe charge or payment intent — cannot issue refund.');
    }

    if (payment.payment_status === 'REFUNDED') {
      throw new BadRequestException('Payment has already been refunded.');
    }

    if (payment.payment_status !== 'SUCCEEDED') {
      throw new BadRequestException('Only succeeded payments can be refunded.');
    }

    const refundParams: Stripe.RefundCreateParams = {
      reason: input.reason || 'requested_by_customer',
    };

    if (chargeId) {
      refundParams.charge = chargeId;
    } else if (paymentIntentId) {
      refundParams.payment_intent = paymentIntentId;
    }

    if (input.amount_cents !== undefined) {
      if (!Number.isFinite(input.amount_cents) || input.amount_cents <= 0) {
        throw new BadRequestException('amount_cents must be a positive number');
      }
      if (input.amount_cents > payment.amount_cents) {
        throw new BadRequestException('Refund amount cannot exceed the original payment amount.');
      }
      refundParams.amount = Math.round(input.amount_cents);
    }

    let refund: Stripe.Refund;
    try {
      refund = await this.stripe.refunds.create(refundParams);
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || 'Stripe refund failed'));
    }

    const isFullRefund =
      !input.amount_cents || input.amount_cents >= payment.amount_cents;

    await this.customerPayments.updatePayment(companyId, paymentId, {
      payment_status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      ...(chargeId ? { stripe_charge_id: chargeId } : {}),
      metadata: {
        ...(payment.metadata || {}),
        refund_id: refund.id,
        refunded_amount_cents: String(refund.amount),
        refunded_at: String(Date.now()),
      },
    });

    return {
      refund_id: refund.id,
      status: refund.status || 'succeeded',
      amount_cents: refund.amount,
    };
  }

  async handleConnectWebhook(signature: string, rawBody: Buffer): Promise<void> {
    const event = this.constructConnectWebhookEvent(rawBody, signature);
    if (event.type === 'account.updated') {
      await this.handleAccountUpdated(event.data.object as Stripe.Account);
      return;
    }

    if (event.type.startsWith('payment_intent.')) {
      await this.customerPayments.syncFromPaymentIntent(event.data.object as Stripe.PaymentIntent);
      return;
    }

    if (event.type === 'checkout.session.completed') {
      await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    }

    if (event.type === 'invoice.payment_succeeded') {
      await this.handleInvoiceSubscriptionUpdate(event.data.object as Stripe.Invoice, 'SUCCEEDED');
      return;
    }

    if (event.type === 'invoice.payment_failed') {
      await this.handleInvoiceSubscriptionUpdate(event.data.object as Stripe.Invoice, 'FAILED');
      return;
    }

    if (event.type === 'customer.subscription.deleted') {
      await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }
  }

  constructConnectWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not configured');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  private async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    const companyId = await this.findCompanyByConnectAccountId(account.id);
    if (!companyId) return;

    await this.upsertConnectedAccount(companyId, account);
    const onboardingComplete = Boolean(account.details_submitted && account.charges_enabled);
    await this.companies.updateCompany(companyId, {
      stripe_connect_onboarding_complete: onboardingComplete,
    } as any);
  }

  private async findCompanyByConnectAccountId(accountId: string): Promise<string | null> {
    const result = await this.dynamodb.scan('companies', {
      filterExpression: '#stripe_connect_account_id = :account_id',
      expressionAttributeNames: {
        '#stripe_connect_account_id': 'stripe_connect_account_id',
      },
      expressionAttributeValues: {
        ':account_id': accountId,
      },
      limit: 1,
    });
    const company = result.items?.[0] as any;
    return company?.company_id ? String(company.company_id) : null;
  }

  private async upsertConnectedAccount(companyId: string, account: Stripe.Account): Promise<void> {
    const now = Date.now();
    try {
      const existing = await this.dynamodb.get('connected_accounts', { company_id: companyId });

      await this.dynamodb.put('connected_accounts', {
        company_id: companyId,
        stripe_account_id: account.id,
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        requirements_due: account.requirements?.currently_due || [],
        disabled_reason: account.requirements?.disabled_reason || null,
        created_at: Number(existing?.created_at || now),
        updated_at: now,
      });
    } catch (error: any) {
      const code = String(error?.name || error?.code || '').toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      if (code.includes('resourcenotfound') || message.includes('requested resource not found')) {
        // Backward-compatible: allow Connect setup even if optional tracking table hasn't been created yet.
        return;
      }
      throw error;
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata || {};
    const companyId = metadata.company_id;
    const paymentId = metadata.payment_id;
    if (!companyId || !paymentId) return;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    await this.customerPayments.updatePayment(companyId, paymentId, {
      payment_status: 'PROCESSING',
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: subscriptionId || undefined,
    });
  }

  private async handleInvoiceSubscriptionUpdate(
    invoice: Stripe.Invoice,
    status: 'SUCCEEDED' | 'FAILED',
  ): Promise<void> {
    const invoiceMetadata = invoice.metadata || {};
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;

    let companyId = invoiceMetadata.company_id;
    let paymentId = invoiceMetadata.payment_id;
    let subscriptionMetadata: Record<string, string> = {};
    let hydratedInvoice: Stripe.Invoice = invoice;
    try {
      hydratedInvoice = await this.getInvoice(invoice.id);
    } catch {
      // If retrieve fails, continue with webhook payload as best-effort.
    }

    const extractedInvoiceIds = this.extractInvoicePaymentIds(hydratedInvoice as any);
    let paymentIntentId = extractedInvoiceIds.paymentIntentId;
    let chargeId = extractedInvoiceIds.chargeId;

    if ((!companyId || !paymentId) && subscriptionId) {
      try {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        companyId = companyId || subscription.metadata?.company_id;
        paymentId = paymentId || subscription.metadata?.payment_id;
        subscriptionMetadata = subscription.metadata || {};
      } catch {
        // Ignore metadata lookup errors; payment sync below is best-effort.
      }
    }

    if (!chargeId && paymentIntentId) {
      try {
        const paymentIntent = await this.getPaymentIntent(paymentIntentId);
        chargeId = this.extractStripeId((paymentIntent as any).latest_charge);
      } catch {
        // best-effort
      }
    }

    if (!companyId) return;

    const paymentIdForInvoice = paymentId || `inv_${invoice.id}`;
    const updated = await this.customerPayments.updatePayment(companyId, paymentIdForInvoice, {
      payment_status: status,
      stripe_subscription_id: subscriptionId || undefined,
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      ...(chargeId ? { stripe_charge_id: chargeId } : {}),
      paid_at: status === 'SUCCEEDED' ? Date.now() : undefined,
    });

    if (!updated) {
      await this.customerPayments.createPayment(companyId, {
        payment_id: paymentIdForInvoice,
        contact_id: subscriptionMetadata.contact_id || undefined,
        appointment_id: subscriptionMetadata.appointment_id || undefined,
        customer_name: subscriptionMetadata.customer_name || undefined,
        customer_email: invoice.customer_email || subscriptionMetadata.customer_email || undefined,
        service_name:
          subscriptionMetadata.service_name ||
          invoiceMetadata.service_name ||
          'Subscription payment',
        payment_type: 'SUBSCRIPTION',
        payment_status: status,
        amount_cents: Math.max(0, Math.round(Number(invoice.amount_paid || invoice.amount_due || 0))),
        currency: String(invoice.currency || 'usd').toLowerCase(),
        stripe_subscription_id: subscriptionId || undefined,
        stripe_payment_intent_id: paymentIntentId || undefined,
        stripe_charge_id: chargeId || undefined,
        metadata: {
          source: 'stripe_invoice',
          invoice_id: invoice.id,
          linked_payment_id: paymentId || undefined,
        },
        paid_at: status === 'SUCCEEDED' ? Date.now() : undefined,
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const companyId = subscription.metadata?.company_id;
    const paymentId = subscription.metadata?.payment_id;
    if (!companyId || !paymentId) return;

    await this.customerPayments.updatePayment(companyId, paymentId, {
      payment_status: 'CANCELED',
      stripe_subscription_id: subscription.id,
    });
  }
}

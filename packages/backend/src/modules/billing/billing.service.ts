import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { UsageService } from './usage.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { SubscriptionPlan, SubscriptionStatus, CompanyStatus } from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  constructor(
    private stripeService: StripeService,
    private usageService: UsageService,
    private dynamodb: DynamoDBService,
    private companiesService: CompaniesService
  ) {}

  private static readonly PLAN_MONTHLY_PRICE_CENTS: Record<SubscriptionPlan, number> = {
    [SubscriptionPlan.STARTER]: 1999,
    [SubscriptionPlan.PRO]: 3999,
    [SubscriptionPlan.MAX]: 9999,
  };

  private toMsOrNull(value: number | null | undefined): number | null {
    return Number.isFinite(value as number) ? Number(value) * 1000 : null;
  }

  /**
   * Create setup intent for collecting payment method
   */
  async createSetupIntent(companyId: string): Promise<{ client_secret: string }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    let customerId = company.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await this.stripeService.createCustomer(
        company.email,
        company.company_name,
        { company_id: companyId }
      );
      customerId = customer.id;

      // Update company with customer ID
      await this.companiesService.updateCompany(companyId, {
        stripe_customer_id: customerId,
      });
    }

    const setupIntent = await this.stripeService.createSetupIntent(customerId);
    return { client_secret: setupIntent.client_secret! };
  }

  /**
   * Create subscription for a company
   */
  async createSubscription(
    companyId: string,
    plan: SubscriptionPlan,
    paymentMethodId: string
  ): Promise<{ subscription: any }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Check if already has active subscription
    if (company.stripe_subscription_id) {
      throw new BadRequestException('Company already has an active subscription');
    }

    let customerId = company.stripe_customer_id;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await this.stripeService.createCustomer(
        company.email,
        company.company_name,
        { company_id: companyId }
      );
      customerId = customer.id;
    }

    // Get price ID for plan
    const priceId = this.stripeService.getPriceIdForPlan(plan);

    const eligibleForProTrial = plan === SubscriptionPlan.PRO && !company.trial_used_at;
    const trialDays = eligibleForProTrial ? 14 : 0;

    // Create subscription with trial (Pro only, once)
    const subscription = await this.stripeService.createSubscription(
      customerId,
      priceId,
      paymentMethodId,
      companyId,
      trialDays
    );

    // Get payment method details for UI display
    const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);
    const paymentDetails =
      paymentMethod.card && paymentMethod.card.last4
        ? {
            payment_method_last4: paymentMethod.card.last4,
            payment_method_brand: paymentMethod.card.brand,
          }
        : {};

    const trialEndsAt = subscription.trial_end
      ? this.toMsOrNull(subscription.trial_end)
      : trialDays
      ? Date.now() + trialDays * 24 * 60 * 60 * 1000
      : null;
    const trialStartAt = this.toMsOrNull(subscription.trial_start ?? null);

    // Update company record
    await this.companiesService.updateCompany(companyId, {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_plan: plan,
      subscription_status: this.mapStripeStatus(subscription.status),
      current_period_start: this.toMsOrNull(subscription.current_period_start),
      current_period_end: this.toMsOrNull(subscription.current_period_end),
      cancel_at_period_end: false,
      ...paymentDetails,
      status: this.getCompanyStatus(subscription.status),
      trial_ends_at: eligibleForProTrial ? trialEndsAt : null,
      ...(eligibleForProTrial ? { trial_used_at: trialStartAt || Date.now() } : {}),
      calls_enabled: true,
      sms_enabled: true,
    });

    return { subscription };
  }

  /**
   * Create subscription for a company (admin-initiated, no payment required)
   */
  async createAdminSubscription(
    companyId: string,
    plan: string
  ): Promise<{ subscription: any }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Check if already has active subscription
    if (company.stripe_subscription_id) {
      throw new BadRequestException('Company already has an active subscription. Use update endpoint instead.');
    }

    // For admin-created subscriptions, we don't create Stripe subscription
    // Just update company record with plan details
    const now = Date.now();
    const oneMonthFromNow = now + (30 * 24 * 60 * 60 * 1000); // 30-day billing period

    await this.companiesService.updateCompany(companyId, {
      subscription_plan: plan as SubscriptionPlan,
      subscription_status: SubscriptionStatus.ACTIVE,
      current_period_start: now,
      current_period_end: oneMonthFromNow,
      cancel_at_period_end: false,
      status: CompanyStatus.ACTIVE,
      trial_ends_at: null,
      calls_enabled: true,
      sms_enabled: true,
    });

    return {
      subscription: {
        id: `admin_sub_${companyId}`,
        plan,
        status: 'active',
        current_period_start: Math.floor(now / 1000),
        current_period_end: Math.floor(oneMonthFromNow / 1000),
      }
    };
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(
    companyId: string,
    newPlan: SubscriptionPlan
  ): Promise<{ subscription: any }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_subscription_id) {
      if (!company.subscription_plan) {
        throw new BadRequestException('No active subscription found');
      }

      const updated = await this.companiesService.updateCompany(companyId, {
        subscription_plan: newPlan,
        subscription_status: SubscriptionStatus.ACTIVE,
        cancel_at_period_end: false,
        status: CompanyStatus.ACTIVE,
      });

      return {
        subscription: {
          id: `admin_sub_${companyId}`,
          plan: newPlan,
          status: 'active',
          current_period_start: Math.floor((updated.current_period_start || Date.now()) / 1000),
          current_period_end: Math.floor((updated.current_period_end || Date.now()) / 1000),
        },
      };
    }

    const newPriceId = this.stripeService.getPriceIdForPlan(newPlan);
    const subscription = await this.stripeService.updateSubscription(
      company.stripe_subscription_id,
      newPriceId
    );

    // Update company record
    await this.companiesService.updateCompany(companyId, {
      subscription_plan: newPlan,
      current_period_start: this.toMsOrNull(subscription.current_period_start),
      current_period_end: this.toMsOrNull(subscription.current_period_end),
    });

    return { subscription };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    companyId: string,
    immediate: boolean = false
  ): Promise<{ subscription: any }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_subscription_id) {
      if (!company.subscription_plan) {
        throw new BadRequestException('No active subscription found');
      }

      if (immediate) {
        await this.companiesService.updateCompany(companyId, {
          subscription_plan: null,
          subscription_status: null,
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          status: CompanyStatus.INACTIVE,
          trial_ends_at: null,
          calls_enabled: false,
          sms_enabled: false,
        });
      } else {
        await this.companiesService.updateCompany(companyId, {
          cancel_at_period_end: true,
          status: CompanyStatus.CANCELLED,
        });
      }

      return {
        subscription: {
          id: `admin_sub_${companyId}`,
          status: immediate ? 'canceled' : 'active',
          cancel_at_period_end: !immediate,
        },
      };
    }

    const subscription = await this.stripeService.cancelSubscription(
      company.stripe_subscription_id,
      immediate
    );

    const cancelUpdates = immediate
      ? {
          cancel_at_period_end: false,
          subscription_status: SubscriptionStatus.CANCELED,
          subscription_plan: null,
          stripe_subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          status: CompanyStatus.INACTIVE,
          trial_ends_at: null,
          calls_enabled: false,
          sms_enabled: false,
        }
      : {
          cancel_at_period_end: true,
          status: CompanyStatus.CANCELLED,
        };

    await this.companiesService.updateCompany(companyId, cancelUpdates);

    return { subscription };
  }

  /**
   * Reactivate subscription (admin)
   */
  async reactivateSubscription(companyId: string): Promise<{ subscription: any }> {
    const company = await this.companiesService.findById(companyId);
    if (!company?.stripe_subscription_id) {
      if (!company?.subscription_plan) {
        throw new BadRequestException('No subscription to reactivate');
      }

      const updated = await this.companiesService.updateCompany(companyId, {
        cancel_at_period_end: false,
        subscription_status: SubscriptionStatus.ACTIVE,
        status: CompanyStatus.ACTIVE,
        calls_enabled: true,
        sms_enabled: true,
      });

      return {
        subscription: {
          id: `admin_sub_${companyId}`,
          status: 'active',
          current_period_start: Math.floor((updated.current_period_start || Date.now()) / 1000),
          current_period_end: Math.floor((updated.current_period_end || Date.now()) / 1000),
        },
      };
    }

    const subscription = await this.stripeService.reactivateSubscription(company.stripe_subscription_id);

    await this.companiesService.updateCompany(companyId, {
      cancel_at_period_end: false,
      subscription_status: this.mapStripeStatus(subscription.status),
      status: this.getCompanyStatus(subscription.status),
      current_period_start: this.toMsOrNull(subscription.current_period_start),
      current_period_end: this.toMsOrNull(subscription.current_period_end),
    });

    return { subscription };
  }

  /**
   * Get billing info for a company
   */
  async getBillingInfo(companyId: string): Promise<any> {
    let company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company = await this.reconcileCompanyWithStripe(company);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (
      !company.stripe_subscription_id &&
      company.cancel_at_period_end &&
      company.current_period_end &&
      company.current_period_end <= Date.now()
    ) {
      company = await this.companiesService.updateCompany(companyId, {
        subscription_plan: null,
        subscription_status: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        status: CompanyStatus.INACTIVE,
        trial_ends_at: null,
        calls_enabled: false,
        sms_enabled: false,
      });
      if (!company) {
        throw new NotFoundException('Company not found');
      }
    }

    let subscription = null;
    let paymentMethod = null;

    if (company.stripe_subscription_id) {
      try {
        subscription = await this.stripeService.getSubscription(company.stripe_subscription_id);
      } catch {
        company = await this.reconcileCompanyWithStripe(company);
        if (!company) {
          throw new NotFoundException('Company not found');
        }
        subscription = company.stripe_subscription_id
          ? await this.stripeService.getSubscription(company.stripe_subscription_id).catch(() => null)
          : null;
      }
    }

    if (company.stripe_customer_id) {
      const customer = await this.stripeService.getCustomer(company.stripe_customer_id);
      const pmId = (customer as any).invoice_settings?.default_payment_method;
      if (pmId) {
        // Get payment method details would go here
        paymentMethod = {
          last4: company.payment_method_last4,
          brand: company.payment_method_brand,
        };
      }
    }

    return {
      company_id: companyId,
      subscription_plan: company.subscription_plan,
      subscription_status: company.subscription_status,
      current_period_start: company.current_period_start,
      current_period_end: company.current_period_end,
      cancel_at_period_end: company.cancel_at_period_end,
      payment_method: paymentMethod,
      stripe_subscription: subscription,
    };
  }

  /**
   * Get invoices for a company
   */
  async getInvoices(companyId: string): Promise<any[]> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      return [];
    }

    const invoices = await this.stripeService.listInvoices(company.stripe_customer_id);
    return invoices;
  }

  /**
   * Update payment method for a company
   */
  async updatePaymentMethod(companyId: string, paymentMethodId: string): Promise<any> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      throw new BadRequestException('No Stripe customer found');
    }

    // Attach payment method to customer and set as default
    await this.stripeService.updateCustomerPaymentMethod(company.stripe_customer_id, paymentMethodId);

    // Get payment method details
    const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);
    const paymentDetails =
      paymentMethod.card && paymentMethod.card.last4
        ? {
            payment_method_last4: paymentMethod.card.last4,
            payment_method_brand: paymentMethod.card.brand,
          }
        : {};

    // Update company record
    await this.companiesService.updateCompany(companyId, paymentDetails);

    return { success: true, ...paymentDetails };
  }

  /**
   * List payment methods for a company
   */
  async listPaymentMethods(companyId: string): Promise<any> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      return { payment_methods: [], default_payment_method_id: null };
    }

    const customer = await this.stripeService.getCustomer(company.stripe_customer_id);
    const defaultId = (customer as any).invoice_settings?.default_payment_method || null;
    const methods = await this.stripeService.listCustomerPaymentMethods(company.stripe_customer_id);

    const paymentMethods = methods.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      is_default: pm.id === defaultId,
    }));

    const defaultPm = methods.find((pm) => pm.id === defaultId);
    if (defaultPm?.card?.last4) {
      if (
        company.payment_method_last4 !== defaultPm.card.last4 ||
        company.payment_method_brand !== defaultPm.card.brand
      ) {
        await this.companiesService.updateCompany(companyId, {
          payment_method_last4: defaultPm.card.last4,
          payment_method_brand: defaultPm.card.brand,
        });
      }
    }

    return { payment_methods: paymentMethods, default_payment_method_id: defaultId };
  }

  /**
   * Set default payment method for a company
   */
  async setDefaultPaymentMethod(companyId: string, paymentMethodId: string): Promise<any> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      throw new BadRequestException('No Stripe customer found');
    }

    const methods = await this.stripeService.listCustomerPaymentMethods(company.stripe_customer_id);
    const match = methods.find((pm) => pm.id === paymentMethodId);
    if (!match) {
      throw new BadRequestException('Payment method not found');
    }

    await this.stripeService.setCustomerDefaultPaymentMethod(company.stripe_customer_id, paymentMethodId);

    if (match.card?.last4) {
      await this.companiesService.updateCompany(companyId, {
        payment_method_last4: match.card.last4,
        payment_method_brand: match.card.brand,
      });
    }

    return { success: true, default_payment_method_id: paymentMethodId };
  }

  /**
   * Remove a payment method (requires at least one remaining)
   */
  async deletePaymentMethod(companyId: string, paymentMethodId: string): Promise<any> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      throw new BadRequestException('No Stripe customer found');
    }

    const customer = await this.stripeService.getCustomer(company.stripe_customer_id);
    const defaultId = (customer as any).invoice_settings?.default_payment_method || null;
    const methods = await this.stripeService.listCustomerPaymentMethods(company.stripe_customer_id);

    if (methods.length <= 1) {
      throw new BadRequestException('At least one payment method is required');
    }

    const isDefault = paymentMethodId === defaultId;
    let nextDefaultId = defaultId;

    if (isDefault) {
      const replacement = methods.find((pm) => pm.id !== paymentMethodId);
      if (!replacement) {
        throw new BadRequestException('At least one payment method is required');
      }
      nextDefaultId = replacement.id;
      await this.stripeService.setCustomerDefaultPaymentMethod(company.stripe_customer_id, nextDefaultId);

      if (replacement.card?.last4) {
        await this.companiesService.updateCompany(companyId, {
          payment_method_last4: replacement.card.last4,
          payment_method_brand: replacement.card.brand,
        });
      }
    }

    await this.stripeService.detachPaymentMethod(paymentMethodId);

    return { success: true, default_payment_method_id: nextDefaultId };
  }

  /**
   * Get usage stats for a company
   */
  async getUsageStats(companyId: string): Promise<any> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const periodStart = company.current_period_start || this.getCurrentMonthStartUtc();
    const usage = await this.usageService.getCurrentPeriodUsage(companyId, periodStart);
    const plan = company.subscription_plan;
    const limits = plan ? await this.usageService.checkLimitsExceeded(companyId, plan, periodStart) : null;

    return {
      usage,
      limits,
      plan_limits: plan ? this.usageService.getPlanLimits(plan) : undefined,
    };
  }

  /**
   * Admin: reset today's usage to zero
   */
  async resetTodayUsage(companyId: string): Promise<void> {
    await this.usageService.setTodayUsage(companyId, { minutes: 0, sms: 0, contacts: 0 });
  }

  /**
   * Admin: adjust today's usage by delta (positive adds usage, negative gives credits back)
   */
  async adjustTodayUsage(
    companyId: string,
    deltas: { minutes?: number; sms?: number; contacts?: number }
  ): Promise<void> {
    await this.usageService.adjustTodayUsage(companyId, deltas);
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(signature: string, rawBody: Buffer): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Check for duplicate events
    const existingEvent = await this.dynamodb.query(
      'billing_events',
      '#stripe_event_id = :event_id',
      { '#stripe_event_id': 'stripe_event_id' },
      { ':event_id': event.id },
      { indexName: 'stripe_event_id-index', limit: 1 }
    );

    if (existingEvent.items.length > 0) {
      console.log('[BillingService] Duplicate webhook event, skipping:', event.id);
      return;
    }

    // Process event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log('[BillingService] Unhandled event type:', event.type);
    }

    // Log event
    await this.logBillingEvent(event);
  }

  /**
   * Handle subscription updated webhook
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const companyId = await this.resolveCompanyIdForSubscriptionEvent(subscription);
    if (!companyId) {
      console.warn('[BillingService] Subscription missing company_id metadata:', subscription.id);
      return;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = this.stripeService.getPlanFromPriceId(priceId);
    const isCanceling = subscription.cancel_at_period_end === true;
    const isTrialing = subscription.status === 'trialing';
    const trialEndsAt = this.toMsOrNull(subscription.trial_end ?? null);
    const trialStartedAt = this.toMsOrNull(subscription.trial_start ?? null);
    const isProTrial = plan === SubscriptionPlan.PRO && isTrialing;

    await this.companiesService.updateCompany(companyId, {
      subscription_status: this.mapStripeStatus(subscription.status),
      current_period_start: this.toMsOrNull(subscription.current_period_start),
      current_period_end: this.toMsOrNull(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      subscription_plan: plan ?? undefined,
      status: isCanceling ? CompanyStatus.CANCELLED : this.getCompanyStatus(subscription.status),
      trial_ends_at: isProTrial ? trialEndsAt : null,
      ...(isProTrial ? { trial_used_at: trialStartedAt || Date.now() } : {}),
    });
  }

  /**
   * Handle subscription deleted webhook
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const companyId = await this.resolveCompanyIdForSubscriptionEvent(subscription);
    if (!companyId) return;

    await this.companiesService.updateCompany(companyId, {
      subscription_status: null,
      subscription_plan: null,
      stripe_subscription_id: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      status: CompanyStatus.INACTIVE,
      trial_ends_at: null,
      calls_enabled: false,
      sms_enabled: false,
    });
  }

  /**
   * Handle invoice paid webhook
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // Log successful payment
    console.log('[BillingService] Invoice paid:', invoice.id);
  }

  /**
   * Handle invoice payment failed webhook
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Log failed payment, could send notification
    console.error('[BillingService] Invoice payment failed:', invoice.id);
  }

  /**
   * Log billing event to DynamoDB
   */
  private async logBillingEvent(event: Stripe.Event): Promise<void> {
    const eventId = `${Date.now()}-${uuidv4()}`;
    const companyId = (event.data.object as any)?.metadata?.company_id || 'unknown';

    await this.dynamodb.put('billing_events', {
      company_id: companyId,
      event_id: eventId,
      event_type: event.type,
      stripe_event_id: event.id,
      data: event.data.object,
      created_at: Date.now(),
    });
  }

  /**
   * Map Stripe subscription status to our enum
   */
  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE,
      paused: SubscriptionStatus.PAST_DUE,
    };
    return statusMap[stripeStatus] || SubscriptionStatus.ACTIVE;
  }

  /**
   * Map subscription status to company status
   */
  private getCompanyStatus(stripeStatus: string): CompanyStatus {
    switch (stripeStatus) {
      case 'active':
        return CompanyStatus.ACTIVE;
      case 'trialing':
        return CompanyStatus.TRIAL;
      case 'past_due':
      case 'unpaid':
        return CompanyStatus.SUSPENDED;
      case 'canceled':
        return CompanyStatus.INACTIVE;
      case 'incomplete':
      case 'incomplete_expired':
      case 'paused':
        return CompanyStatus.SUSPENDED;
      default:
        return CompanyStatus.SUSPENDED;
    }
  }

  private getCurrentMonthStartUtc(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }

  private normalizeSubscriptionForSorting(
    subscription: Stripe.Subscription
  ): { rank: number; created: number } {
    const status = String(subscription.status || '').toLowerCase();
    const rank =
      status === 'active' || status === 'trialing'
        ? 3
        : status === 'past_due' || status === 'unpaid'
        ? 2
        : status === 'incomplete'
        ? 1
        : 0;
    return { rank, created: Number(subscription.created || 0) };
  }

  private async findCompanyByStripeCustomerId(customerId: string) {
    const scan = await this.dynamodb.scan('companies', {
      filterExpression: '#stripe_customer_id = :customer_id',
      expressionAttributeNames: { '#stripe_customer_id': 'stripe_customer_id' },
      expressionAttributeValues: { ':customer_id': customerId },
      limit: 1,
    });
    return (scan.items?.[0] as any) || null;
  }

  private async findCompanyByStripeSubscriptionId(subscriptionId: string) {
    const scan = await this.dynamodb.scan('companies', {
      filterExpression: '#stripe_subscription_id = :subscription_id',
      expressionAttributeNames: { '#stripe_subscription_id': 'stripe_subscription_id' },
      expressionAttributeValues: { ':subscription_id': subscriptionId },
      limit: 1,
    });
    return (scan.items?.[0] as any) || null;
  }

  private async resolveCompanyIdForSubscriptionEvent(subscription: Stripe.Subscription): Promise<string | null> {
    if (subscription.metadata?.company_id) return subscription.metadata.company_id;

    const bySubId = await this.findCompanyByStripeSubscriptionId(subscription.id);
    if (bySubId?.company_id) return String(bySubId.company_id);

    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      const byCustomerId = await this.findCompanyByStripeCustomerId(customerId);
      if (byCustomerId?.company_id) return String(byCustomerId.company_id);
    }

    return null;
  }

  private async reconcileCompanyWithStripe(company: any): Promise<any> {
    if (!company?.company_id) return company;
    if (!company.stripe_customer_id && !company.stripe_subscription_id) return company;

    let stripeSubscription: Stripe.Subscription | null = null;

    if (company.stripe_subscription_id) {
      try {
        stripeSubscription = await this.stripeService.getSubscription(company.stripe_subscription_id);
      } catch {
        stripeSubscription = null;
      }
    }

    if (!stripeSubscription && company.stripe_customer_id) {
      const subs = await this.stripeService.listCustomerSubscriptions(company.stripe_customer_id, 20);
      if (subs.length > 0) {
        subs.sort((a, b) => {
          const left = this.normalizeSubscriptionForSorting(a);
          const right = this.normalizeSubscriptionForSorting(b);
          if (right.rank !== left.rank) return right.rank - left.rank;
          return right.created - left.created;
        });
        stripeSubscription = subs[0];
      }
    }

    if (!stripeSubscription) {
      const hadStripeState = Boolean(
        company.stripe_subscription_id ||
          company.subscription_plan ||
          company.subscription_status ||
          company.cancel_at_period_end ||
          company.current_period_start ||
          company.current_period_end
      );
      if (!hadStripeState) return company;

      return this.companiesService.updateCompany(company.company_id, {
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
      });
    }

    const status = String(stripeSubscription.status || '').toLowerCase();
    const isCanceled = status === 'canceled';
    const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const mappedPlan = this.stripeService.getPlanFromPriceId(priceId) || company.subscription_plan || null;

    const updates: Record<string, any> = {
      stripe_subscription_id: isCanceled ? null : stripeSubscription.id,
      subscription_status: isCanceled ? null : this.mapStripeStatus(status),
      subscription_plan: isCanceled ? null : mappedPlan,
      current_period_start: isCanceled ? null : this.toMsOrNull(stripeSubscription.current_period_start),
      current_period_end: isCanceled ? null : this.toMsOrNull(stripeSubscription.current_period_end),
      cancel_at_period_end: isCanceled ? false : Boolean(stripeSubscription.cancel_at_period_end),
      status: isCanceled ? CompanyStatus.INACTIVE : this.getCompanyStatus(status),
      trial_ends_at:
        status === 'trialing' ? this.toMsOrNull(stripeSubscription.trial_end ?? null) : null,
      calls_enabled: isCanceled ? false : company.calls_enabled,
      sms_enabled: isCanceled ? false : company.sms_enabled,
    };

    const hasDifferences =
      company.stripe_subscription_id !== updates.stripe_subscription_id ||
      company.subscription_status !== updates.subscription_status ||
      company.subscription_plan !== updates.subscription_plan ||
      company.current_period_start !== updates.current_period_start ||
      company.current_period_end !== updates.current_period_end ||
      Boolean(company.cancel_at_period_end) !== Boolean(updates.cancel_at_period_end) ||
      company.status !== updates.status;

    if (!hasDifferences) return company;
    return this.companiesService.updateCompany(company.company_id, updates);
  }

  async listAllSubscriptions(filters?: { status?: string; plan?: string }): Promise<any[]> {
    const companies = await this.companiesService.listAll(1000);
    const rows = companies
      .filter((company: any) => company.subscription_plan || company.stripe_subscription_id || company.subscription_status)
      .map((company: any) => {
        const plan = company.subscription_plan as SubscriptionPlan | null;
        return {
          company_id: company.company_id,
          company_name: company.company_name,
          plan,
          status: company.subscription_status || null,
          current_period_start: company.current_period_start || null,
          current_period_end: company.current_period_end || null,
          stripe_subscription_id: company.stripe_subscription_id || null,
          stripe_customer_id: company.stripe_customer_id || null,
          cancel_at_period_end: Boolean(company.cancel_at_period_end),
        };
      });

    const filtered = rows.filter((row) => {
      const matchesStatus = filters?.status ? String(row.status || '').toUpperCase() === String(filters.status).toUpperCase() : true;
      const matchesPlan = filters?.plan ? String(row.plan || '').toUpperCase() === String(filters.plan).toUpperCase() : true;
      return matchesStatus && matchesPlan;
    });

    filtered.sort((a, b) => Number(b.current_period_end || 0) - Number(a.current_period_end || 0));
    return filtered;
  }

  async getRevenueMetrics(): Promise<{
    total_mrr: number;
    starter_mrr: number;
    pro_mrr: number;
    max_mrr: number;
    active_subscriptions: number;
    trialing_subscriptions: number;
    canceled_subscriptions: number;
  }> {
    const companies = await this.companiesService.listAll(1000);
    let starterCount = 0;
    let proCount = 0;
    let maxCount = 0;
    let active = 0;
    let trialing = 0;
    let canceled = 0;

    for (const company of companies as any[]) {
      const status = String(company.subscription_status || '').toUpperCase();
      const plan = String(company.subscription_plan || '').toUpperCase();
      if (status === SubscriptionStatus.ACTIVE) active += 1;
      if (status === SubscriptionStatus.TRIALING) trialing += 1;
      if (status === SubscriptionStatus.CANCELED || company.cancel_at_period_end) canceled += 1;

      const billable = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;
      if (!billable) continue;

      if (plan === SubscriptionPlan.STARTER) starterCount += 1;
      if (plan === SubscriptionPlan.PRO) proCount += 1;
      if (plan === SubscriptionPlan.MAX) maxCount += 1;
    }

    const starter_mrr = (starterCount * BillingService.PLAN_MONTHLY_PRICE_CENTS[SubscriptionPlan.STARTER]) / 100;
    const pro_mrr = (proCount * BillingService.PLAN_MONTHLY_PRICE_CENTS[SubscriptionPlan.PRO]) / 100;
    const max_mrr = (maxCount * BillingService.PLAN_MONTHLY_PRICE_CENTS[SubscriptionPlan.MAX]) / 100;
    const total_mrr = starter_mrr + pro_mrr + max_mrr;

    return {
      total_mrr,
      starter_mrr,
      pro_mrr,
      max_mrr,
      active_subscriptions: active,
      trialing_subscriptions: trialing,
      canceled_subscriptions: canceled,
    };
  }
  // ============================================================================
  // Add-on Packs
  // ============================================================================

  static readonly ADDON_CATALOG = [
    {
      id: 'MINUTES_100',
      name: '100 Extra Minutes',
      description: 'Add 100 minutes of AI call handling',
      price_cents: 999,
      price_display: '$9.99',
      minutes: 100,
      sms: 0,
    },
    {
      id: 'MINUTES_250',
      name: '250 Extra Minutes',
      description: 'Add 250 minutes of AI call handling',
      price_cents: 1999,
      price_display: '$19.99',
      minutes: 250,
      sms: 0,
    },
    {
      id: 'SMS_200',
      name: '200 Extra SMS',
      description: 'Add 200 outbound SMS messages',
      price_cents: 499,
      price_display: '$4.99',
      minutes: 0,
      sms: 200,
    },
    {
      id: 'SMS_500',
      name: '500 Extra SMS',
      description: 'Add 500 outbound SMS messages',
      price_cents: 999,
      price_display: '$9.99',
      minutes: 0,
      sms: 500,
    },
  ] as const;

  getAddonCatalog() {
    return BillingService.ADDON_CATALOG;
  }

  async purchaseAddonPack(
    companyId: string,
    packId: string,
  ): Promise<{ success: boolean; pack: any; payment_intent_id: string }> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.stripe_customer_id) {
      throw new BadRequestException('No billing account on file. Please set up billing first.');
    }

    const pack = BillingService.ADDON_CATALOG.find((p) => p.id === packId);
    if (!pack) {
      throw new BadRequestException(`Unknown add-on pack: ${packId}`);
    }

    // Charge the customer
    const paymentIntent = await this.stripeService.chargeOffSession(
      company.stripe_customer_id,
      pack.price_cents,
      `HandyCall add-on: ${pack.name}`,
      { company_id: companyId, pack_id: packId },
    );

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(`Payment did not succeed (status: ${paymentIntent.status}). Please check your payment method.`);
    }

    // Grant the credits (negative delta = grant credits that offset today's usage)
    if (pack.minutes > 0) {
      await this.usageService.adjustTodayUsage(companyId, { minutes: -pack.minutes });
    }
    if (pack.sms > 0) {
      await this.usageService.adjustTodayUsage(companyId, { sms: -pack.sms });
    }

    // Log the addon purchase
    const now = Date.now();
    await this.dynamodb.put('billing_events', {
      company_id: companyId,
      event_id: uuidv4(),
      event_type: 'addon_purchased',
      pack_id: packId,
      pack_name: pack.name,
      amount_cents: pack.price_cents,
      payment_intent_id: paymentIntent.id,
      minutes_granted: pack.minutes,
      sms_granted: pack.sms,
      created_at: now,
    });

    return {
      success: true,
      pack: { ...pack },
      payment_intent_id: paymentIntent.id,
    };
  }

}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from '@handycall/shared';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(
    email: string,
    name: string,
    metadata: Record<string, string>
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      name,
      metadata,
    });
  }

  /**
   * Create a subscription with trial period
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    paymentMethodId: string,
    companyId: string,
    trialDays?: number
  ): Promise<Stripe.Subscription> {
    // Attach payment method to customer
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const payload: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      metadata: { company_id: companyId },
    };

    if (typeof trialDays === 'number') {
      if (trialDays > 0) {
        payload.trial_period_days = trialDays;
      } else {
        // Ensure no trial applies even if the price has a default trial configured.
        payload.trial_end = 'now';
      }
    }

    return this.stripe.subscriptions.create(payload);
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

    return this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'always_invoice',
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<Stripe.Subscription> {
    if (immediate) {
      return this.stripe.subscriptions.cancel(subscriptionId);
    } else {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  /**
   * Retrieve subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  /**
   * List subscriptions for a customer (any status)
   */
  async listCustomerSubscriptions(customerId: string, limit: number = 20): Promise<Stripe.Subscription[]> {
    const result = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit,
    });
    return result.data;
  }

  /**
   * Create setup intent for collecting payment method
   */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  /**
   * Retrieve payment method details
   */
  async getPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }

  /**
   * List customer invoices
   */
  async listInvoices(customerId: string, limit: number = 100): Promise<Stripe.Invoice[]> {
    const result = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return result.data;
  }

  /**
   * Get customer details
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    return this.stripe.customers.retrieve(customerId) as Promise<Stripe.Customer>;
  }

  /**
   * Update customer payment method
   */
  async updateCustomerPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<void> {
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  /**
   * Set the default payment method for invoices
   */
  async setCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string | null
  ): Promise<void> {
    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId || undefined,
      },
    });
  }

  /**
   * List customer payment methods
   */
  async listCustomerPaymentMethods(customerId: string, limit: number = 20): Promise<Stripe.PaymentMethod[]> {
    const result = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit,
    });
    return result.data;
  }

  /**
   * Detach a payment method from the customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  /**
   * Construct and verify webhook event
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      const error = err as Error;
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Get price ID for a plan
   */
  getPriceIdForPlan(plan: string): string {
    const priceIds = {
      STARTER: this.configService.get<string>('STRIPE_PRICE_STARTER'),
      PRO: this.configService.get<string>('STRIPE_PRICE_PRO'),
      MAX: this.configService.get<string>('STRIPE_PRICE_MAX'),
    };

    const priceId = priceIds[plan as keyof typeof priceIds];
    if (!priceId) {
      throw new Error(`Price ID not configured for plan: ${plan}`);
    }

    return priceId;
  }

  /**
   * Map a Stripe price ID back to a SubscriptionPlan
   */
  getPlanFromPriceId(priceId?: string): SubscriptionPlan | null {
    if (!priceId) return null;
    const starter = this.configService.get<string>('STRIPE_PRICE_STARTER');
    const pro = this.configService.get<string>('STRIPE_PRICE_PRO');
    const max = this.configService.get<string>('STRIPE_PRICE_MAX');

    if (priceId === starter) return SubscriptionPlan.STARTER;
    if (priceId === pro) return SubscriptionPlan.PRO;
    if (priceId === max) return SubscriptionPlan.MAX;
    return null;
  }
  /**
   * Charge a customer off-session using their default payment method
   */
  async chargeOffSession(
    customerId: string,
    amountCents: number,
    description: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    // Retrieve default payment method from customer
    const customer = await this.getCustomer(customerId);
    const paymentMethodId =
      typeof (customer as any).invoice_settings?.default_payment_method === 'string'
        ? (customer as any).invoice_settings.default_payment_method
        : null;

    if (!paymentMethodId) {
      throw new Error('No default payment method on file. Please add a payment method first.');
    }

    return this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      description,
      metadata: metadata || {},
      confirm: true,
      off_session: true,
    });
  }

}

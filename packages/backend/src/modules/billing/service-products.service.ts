import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { v4 as uuidv4 } from 'uuid';

export type ServiceProductPriceType = 'ONE_TIME' | 'SUBSCRIPTION';

export interface ServiceProduct {
  company_id: string;
  product_id: string;
  name: string;
  description?: string;
  price_type: ServiceProductPriceType;
  amount_cents: number;
  currency: string;
  // Subscription-only fields
  billing_interval?: 'day' | 'week' | 'month' | 'year';
  billing_interval_count?: number;
  trial_period_days?: number;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export type CreateServiceProductInput = Omit<
  ServiceProduct,
  'company_id' | 'product_id' | 'created_at' | 'updated_at' | 'active'
> & { active?: boolean };

export type UpdateServiceProductInput = Partial<
  Omit<ServiceProduct, 'company_id' | 'product_id' | 'created_at' | 'updated_at'>
>;

@Injectable()
export class ServiceProductsService {
  private readonly TABLE = 'service_products';

  constructor(private readonly dynamodb: DynamoDBService) {}

  private isResourceNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as { name?: string; message?: string };
    return (
      e.name === 'ResourceNotFoundException' ||
      String(e.message || '').includes('Requested resource not found')
    );
  }

  async create(companyId: string, input: CreateServiceProductInput): Promise<ServiceProduct> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Product name is required');
    }
    if (!Number.isFinite(input.amount_cents) || input.amount_cents < 50) {
      throw new BadRequestException('amount_cents must be at least 50 (i.e. $0.50)');
    }
    if (input.price_type === 'SUBSCRIPTION' && !input.billing_interval) {
      throw new BadRequestException('billing_interval is required for subscription products');
    }

    const now = Date.now();
    const product: ServiceProduct = {
      company_id: companyId,
      product_id: uuidv4(),
      name: input.name.trim(),
      description: input.description?.trim(),
      price_type: input.price_type,
      amount_cents: Math.round(input.amount_cents),
      currency: (input.currency || 'usd').toLowerCase(),
      billing_interval: input.billing_interval,
      billing_interval_count: input.billing_interval_count ?? 1,
      trial_period_days: input.trial_period_days ?? 0,
      active: input.active !== false,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.dynamodb.put(this.TABLE, product as any);
    } catch (error) {
      if (this.isResourceNotFoundError(error)) {
        // Table may not exist yet — return product anyway; DynamoDB table must be provisioned.
        console.warn('[ServiceProductsService] service_products table missing.');
        return product;
      }
      throw error;
    }

    return product;
  }

  async list(
    companyId: string,
    options?: { includeInactive?: boolean },
  ): Promise<ServiceProduct[]> {
    try {
      const page = await this.dynamodb.queryByCompany(this.TABLE, companyId, {});
      const items = (page.items || []) as ServiceProduct[];
      if (options?.includeInactive) return items;
      return items.filter((p) => p.active !== false);
    } catch (error) {
      if (this.isResourceNotFoundError(error)) {
        console.warn('[ServiceProductsService] service_products table missing. Returning empty list.');
        return [];
      }
      throw error;
    }
  }

  async getById(companyId: string, productId: string): Promise<ServiceProduct | null> {
    try {
      const item = await this.dynamodb.get(this.TABLE, {
        company_id: companyId,
        product_id: productId,
      });
      return (item as ServiceProduct) || null;
    } catch (error) {
      if (this.isResourceNotFoundError(error)) return null;
      throw error;
    }
  }

  async update(
    companyId: string,
    productId: string,
    input: UpdateServiceProductInput,
  ): Promise<ServiceProduct> {
    const existing = await this.getById(companyId, productId);
    if (!existing) {
      throw new NotFoundException('Service product not found');
    }

    if (input.amount_cents !== undefined) {
      if (!Number.isFinite(input.amount_cents) || input.amount_cents < 50) {
        throw new BadRequestException('amount_cents must be at least 50');
      }
      input.amount_cents = Math.round(input.amount_cents);
    }

    const updates: Partial<ServiceProduct> = {
      ...input,
      updated_at: Date.now(),
    };

    try {
      const result = await this.dynamodb.update(
        this.TABLE,
        { company_id: companyId, product_id: productId },
        updates as any,
      );
      return (result || { ...existing, ...updates }) as ServiceProduct;
    } catch (error) {
      if (this.isResourceNotFoundError(error)) {
        return { ...existing, ...updates } as ServiceProduct;
      }
      throw error;
    }
  }

  async delete(companyId: string, productId: string): Promise<void> {
    const existing = await this.getById(companyId, productId);
    if (!existing) {
      throw new NotFoundException('Service product not found');
    }
    // Soft-delete: mark as inactive rather than hard delete
    await this.update(companyId, productId, { active: false });
  }

  async hardDelete(companyId: string, productId: string): Promise<void> {
    const existing = await this.getById(companyId, productId);
    if (!existing) {
      throw new NotFoundException('Service product not found');
    }
    try {
      await this.dynamodb.delete(this.TABLE, {
        company_id: companyId,
        product_id: productId,
      });
    } catch (error) {
      if (!this.isResourceNotFoundError(error)) throw error;
    }
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { CreateInvoiceDto, UpdateInvoiceDto, InvoiceStatus } from './dto/invoice.dto';

@Injectable()
export class InvoicingService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
  ) {}

  private calculateTotals(lineItems: any[], taxRate = 0, discountCents = 0) {
    const subtotal = lineItems.reduce((sum, item) => {
      return sum + Math.round(item.quantity * item.unit_price_cents);
    }, 0);
    const taxAmount = Math.round(subtotal * (taxRate / 100));
    const total = Math.max(0, subtotal + taxAmount - discountCents);
    return { subtotal, tax_amount: taxAmount, total };
  }

  private generateInvoiceNumber(slug: string, seq: number): string {
    const s = slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'HC';
    return `${s}-${String(seq).padStart(4, '0')}`;
  }

  async create(companyId: string, dto: CreateInvoiceDto) {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    const now = Date.now();
    const invoiceId = uuidv4();

    // Get next sequence number
    const existing = await this.dynamodb.scan('invoices', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: { '#company_id': 'company_id' },
      expressionAttributeValues: { ':company_id': companyId },
      limit: 1000,
    });
    const seq = (existing.items?.length || 0) + 1;

    const slug = (company as any).company_slug || (company as any).company_name?.toLowerCase().replace(/\s+/g, '-') || 'hc';
    const invoiceNumber = this.generateInvoiceNumber(slug, seq);

    const totals = this.calculateTotals(dto.line_items, dto.tax_rate, dto.discount_amount_cents);

    const invoice = {
      company_id: companyId,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      customer_name: dto.customer_name,
      customer_email: dto.customer_email,
      customer_phone: dto.customer_phone,
      contact_id: dto.contact_id,
      line_items: dto.line_items,
      subtotal_cents: totals.subtotal,
      tax_rate: dto.tax_rate || 0,
      tax_amount_cents: totals.tax_amount,
      discount_amount_cents: dto.discount_amount_cents || 0,
      total_cents: totals.total,
      status: InvoiceStatus.DRAFT,
      notes: dto.notes,
      due_date: dto.due_date,
      created_at: now,
      updated_at: now,
    };

    await this.dynamodb.put('invoices', invoice);
    return invoice;
  }

  async list(companyId: string, options?: { status?: string; limit?: number }) {
    const result = await this.dynamodb.query(
      'invoices',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId },
      { limit: options?.limit || 50 },
    );

    let items = result.items || [];
    if (options?.status) {
      items = items.filter((i: any) => i.status === options.status);
    }

    return items.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0));
  }

  async getById(companyId: string, invoiceId: string) {
    const item = await this.dynamodb.get('invoices', { company_id: companyId, invoice_id: invoiceId });
    if (!item) throw new NotFoundException('Invoice not found');
    return item;
  }

  async update(companyId: string, invoiceId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.getById(companyId, invoiceId) as any;
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot modify a paid invoice');
    }

    const updates: Record<string, any> = { updated_at: Date.now() };
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.notes !== undefined) updates.notes = dto.notes;
    if (dto.due_date !== undefined) updates.due_date = dto.due_date;

    if (dto.line_items) {
      const totals = this.calculateTotals(dto.line_items, dto.tax_rate ?? invoice.tax_rate, dto.discount_amount_cents ?? invoice.discount_amount_cents);
      updates.line_items = dto.line_items;
      updates.subtotal_cents = totals.subtotal;
      updates.tax_rate = dto.tax_rate ?? invoice.tax_rate;
      updates.tax_amount_cents = totals.tax_amount;
      updates.discount_amount_cents = dto.discount_amount_cents ?? invoice.discount_amount_cents;
      updates.total_cents = totals.total;
    }

    await this.dynamodb.update('invoices', { company_id: companyId, invoice_id: invoiceId }, updates);
    return this.getById(companyId, invoiceId);
  }

  async markAsSent(companyId: string, invoiceId: string) {
    return this.update(companyId, invoiceId, { status: InvoiceStatus.SENT });
  }

  async markAsPaid(companyId: string, invoiceId: string) {
    await this.dynamodb.update(
      'invoices',
      { company_id: companyId, invoice_id: invoiceId },
      { status: InvoiceStatus.PAID, paid_at: Date.now(), updated_at: Date.now() },
    );
    return this.getById(companyId, invoiceId);
  }

  async delete(companyId: string, invoiceId: string) {
    const invoice = await this.getById(companyId, invoiceId) as any;
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot delete a paid invoice');
    }
    await this.dynamodb.delete('invoices', { company_id: companyId, invoice_id: invoiceId });
    return { deleted: true };
  }

  async getStats(companyId: string) {
    const all = await this.list(companyId, { limit: 1000 }) as any[];
    const paid = all.filter((i) => i.status === InvoiceStatus.PAID);
    const outstanding = all.filter((i) => i.status === InvoiceStatus.SENT || i.status === InvoiceStatus.OVERDUE || i.status === InvoiceStatus.VIEWED);

    return {
      total_invoices: all.length,
      paid_invoices: paid.length,
      outstanding_invoices: outstanding.length,
      total_revenue_cents: paid.reduce((s: number, i: any) => s + (i.total_cents || 0), 0),
      outstanding_amount_cents: outstanding.reduce((s: number, i: any) => s + (i.total_cents || 0), 0),
    };
  }
}

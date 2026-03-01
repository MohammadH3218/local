import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { v4 as uuidv4 } from 'uuid';
import { CreateQuoteRequestDto, RespondToQuoteDto } from './dto/quote-request.dto';

@Injectable()
export class QuoteRequestsService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  async createQuoteRequest(dto: CreateQuoteRequestDto) {
    const quoteId = uuidv4();
    const now = Date.now();

    const item = {
      quote_id: quoteId,
      // Public quotes don't have a company_id; we use 'marketplace' as partition
      company_id: 'marketplace',
      service_category: dto.service_category,
      job_description: dto.job_description,
      location_zipcode: dto.location_zipcode,
      location_city: dto.location_city,
      contact_name: dto.contact_name,
      contact_email: dto.contact_email,
      contact_phone: dto.contact_phone,
      preferred_date: dto.preferred_date,
      urgency: dto.urgency || 'flexible',
      provider_ids: dto.provider_ids || [],
      status: 'OPEN',
      responses: [],
      created_at: now,
      updated_at: now,
    };

    await this.dynamodb.put('quote_requests', item);
    return item;
  }

  async getQuoteRequest(quoteId: string) {
    const scan = await this.dynamodb.scan('quote_requests', {
      filterExpression: '#quote_id = :quote_id',
      expressionAttributeNames: { '#quote_id': 'quote_id' },
      expressionAttributeValues: { ':quote_id': quoteId },
      limit: 1,
    });
    return (scan.items?.[0] as any) || null;
  }

  async listQuoteRequestsByCategory(category: string, zipcode?: string) {
    const scan = await this.dynamodb.scan('quote_requests', {
      filterExpression: '#company_id = :marketplace AND #status = :open AND #category = :category',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#status': 'status',
        '#category': 'service_category',
      },
      expressionAttributeValues: {
        ':marketplace': 'marketplace',
        ':open': 'OPEN',
        ':category': category,
      },
      limit: 50,
    });

    let items = scan.items || [];
    if (zipcode) {
      items = items.filter((item: any) =>
        String(item.location_zipcode || '').startsWith(zipcode.slice(0, 3))
      );
    }
    return items;
  }

  // Pro responds to a quote request
  async respondToQuote(companyId: string, quoteId: string, dto: RespondToQuoteDto) {
    const existing = await this.getQuoteRequest(quoteId);
    if (!existing) throw new Error('Quote request not found');

    const response = {
      response_id: uuidv4(),
      company_id: companyId,
      message: dto.message,
      estimated_price_cents: dto.estimated_price_cents,
      estimated_duration: dto.estimated_duration,
      responded_at: Date.now(),
    };

    const responses = [...(existing.responses || []), response];

    await this.dynamodb.update(
      'quote_requests',
      { company_id: 'marketplace', quote_id: quoteId },
      { responses, updated_at: Date.now() },
    );

    return response;
  }

  // Pro views quote requests in their service area/category
  async listForPro(companyId: string, category?: string) {
    const scan = await this.dynamodb.scan('quote_requests', {
      filterExpression: '#company_id = :marketplace AND #status = :open',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#status': 'status',
      },
      expressionAttributeValues: {
        ':marketplace': 'marketplace',
        ':open': 'OPEN',
      },
      limit: 100,
    });

    let items = (scan.items || []) as any[];
    if (category) {
      items = items.filter((i) => i.service_category === category);
    }
    // Exclude ones the pro already responded to
    items = items.filter((i) =>
      !(i.responses || []).some((r: any) => r.company_id === companyId)
    );
    return items;
  }

  // Get quote requests the customer submitted (by email)
  async listForCustomer(email: string) {
    const scan = await this.dynamodb.scan('quote_requests', {
      filterExpression: '#company_id = :marketplace AND #email = :email',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#email': 'contact_email',
      },
      expressionAttributeValues: {
        ':marketplace': 'marketplace',
        ':email': email,
      },
      limit: 50,
    });
    return scan.items || [];
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { v4 as uuidv4 } from 'uuid';
import { Contact, ContactSource, LeadStatus } from '@handycall/shared';
import { WebhooksService } from '../webhooks/webhooks.service';

type ContactUi = Contact & { name: string; phone: string };

function normalizePhone(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function buildPhoneVariants(input: string): string[] {
  const trimmed = (input || '').trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits) {
    variants.add(digits);
    if (digits.length === 10) {
      variants.add(`+1${digits}`);
    } else if (digits.length === 11 && digits.startsWith('1')) {
      variants.add(`+${digits}`);
    }
  }
  if (trimmed.startsWith('+') && digits) {
    variants.add(`+${digits}`);
  }
  return Array.from(variants).filter(Boolean);
}

export interface CreateContactDto {
  // Back-compat fields (older UI)
  name?: string;
  phone?: string;

  // Preferred fields (domain model)
  phone_number?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  zipcode?: string;
  source?: ContactSource;
  lead_status?: LeadStatus;
  notes?: string;
}

export interface UpdateContactDto {
  // Back-compat fields (older UI)
  name?: string;
  phone?: string;

  // Preferred fields (domain model)
  phone_number?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  zipcode?: string;
  lead_status?: LeadStatus;
  notes?: string;
}

@Injectable()
export class ContactsService {
  constructor(
    private dynamodb: DynamoDBService,
    private webhooks: WebhooksService,
  ) {}

  private toUiContact(raw: any): ContactUi {
    const first = (raw?.first_name ?? '').toString().trim();
    const last = (raw?.last_name ?? '').toString().trim();
    const legacyName = (raw?.name ?? '').toString().trim();
    const phone = (raw?.phone_number ?? raw?.phone ?? '').toString().trim();
    const name = legacyName || [first, last].filter(Boolean).join(' ') || phone || 'Unknown';

    return {
      ...(raw as Contact),
      phone_number: (raw?.phone_number ?? raw?.phone ?? '') as any,
      name,
      phone,
    };
  }

  async getContacts(
    companyId: string,
    options?: {
      limit?: number;
      lastEvaluatedKey?: any;
    }
  ): Promise<{ contacts: ContactUi[]; lastEvaluatedKey?: any }> {
    // Prefer a company-keyed query (fast path), fall back to scan if needed.
    let result: { items: any[]; lastEvaluatedKey?: any };
    try {
      result = await this.dynamodb.queryByCompany('contacts', companyId, undefined, {
        limit: options?.limit || 50,
        exclusiveStartKey: options?.lastEvaluatedKey,
      });
    } catch {
      result = await this.dynamodb.scan('contacts', {
        filterExpression: '#company_id = :company_id',
        expressionAttributeNames: { '#company_id': 'company_id' },
        expressionAttributeValues: { ':company_id': companyId },
        limit: options?.limit || 50,
        exclusiveStartKey: options?.lastEvaluatedKey,
      });
    }

    const items = (result.items || []).map((c) => this.toUiContact(c));

    // Sort by last_contact_at/updated_at/created_at descending (most recent first)
    items.sort((a, b) => {
      const aTs = Number(a.last_contact_at ?? a.updated_at ?? a.created_at ?? 0);
      const bTs = Number(b.last_contact_at ?? b.updated_at ?? b.created_at ?? 0);
      return bTs - aTs;
    });

    return { contacts: items, lastEvaluatedKey: result.lastEvaluatedKey };
  }

  async getContactById(companyId: string, contactId: string): Promise<ContactUi> {
    const contact = await this.dynamodb.get('contacts', { company_id: companyId, contact_id: contactId });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return this.toUiContact(contact);
  }

  async getContactByPhone(companyId: string, phone: string): Promise<ContactUi | null> {
    const normalized = normalizePhone(phone);
    const result = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id AND (#phone_number = :phone OR #phone = :phone)',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#phone_number': 'phone_number',
        '#phone': 'phone',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':phone': normalized,
      },
      limit: 1,
    });

    return result.items.length > 0 ? this.toUiContact(result.items[0]) : null;
  }

  async createContact(companyId: string, data: CreateContactDto): Promise<ContactUi> {
    const contactId = uuidv4();
    const now = Date.now();

    const phone_number = normalizePhone(data.phone_number || data.phone || '');
    if (!phone_number) {
      throw new BadRequestException('phone_number is required');
    }

    const existingName = (data.name || '').trim();
    const first = (data.first_name || '').trim() || (existingName.split(/\s+/)[0] || '').trim();
    const last =
      (data.last_name || '').trim() ||
      (existingName.split(/\s+/).slice(1).join(' ') || '').trim() ||
      undefined;

    const contact: Contact = {
      company_id: companyId,
      contact_id: contactId,
      phone_number,
      email: data.email?.trim() || undefined,
      first_name: first || undefined,
      last_name: last || undefined,
      address: data.address?.trim() || undefined,
      zipcode: data.zipcode?.trim() || undefined,
      source: data.source ?? ContactSource.MANUAL,
      lead_status: data.lead_status ?? LeadStatus.NEW,
      notes: data.notes,
      created_at: now,
      updated_at: now,
      last_contact_at: now,
    };

    await this.dynamodb.put('contacts', contact);

    const created = this.toUiContact(contact);
    void this.webhooks.emitEvent(companyId, 'contact.created', { contact: created });

    return created;
  }

  async updateContact(
    companyId: string,
    contactId: string,
    data: UpdateContactDto
  ): Promise<ContactUi> {
    const existing = await this.getContactById(companyId, contactId);

    const phone_number = normalizePhone(data.phone_number || data.phone || '') || undefined;
    const legacyName = (data.name || '').trim();
    const first_name =
      (data.first_name || '').trim() ||
      (legacyName ? legacyName.split(/\s+/)[0]?.trim() : '') ||
      undefined;
    const last_name =
      (data.last_name || '').trim() ||
      (legacyName ? legacyName.split(/\s+/).slice(1).join(' ')?.trim() : '') ||
      undefined;

    const updates = {
      ...(phone_number && { phone_number }),
      ...(data.email !== undefined && { email: data.email }),
      ...(first_name && { first_name }),
      ...(last_name && { last_name }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.zipcode !== undefined && { zipcode: data.zipcode }),
      ...(data.lead_status !== undefined && { lead_status: data.lead_status }),
      ...(data.notes !== undefined && { notes: data.notes }),
      updated_at: Date.now(),
    };

    await this.dynamodb.update(
      'contacts',
      { company_id: companyId, contact_id: contactId },
      updates
    );
    const updated = this.toUiContact({ ...existing, ...updates });
    void this.webhooks.emitEvent(companyId, 'contact.updated', { contact: updated });

    return updated;
  }

  async deleteContact(companyId: string, contactId: string): Promise<void> {
    const contact = await this.getContactById(companyId, contactId);

    await this.dynamodb.delete('contacts', {
      company_id: companyId,
      contact_id: contactId,
    });
  }

  async searchContacts(
    companyId: string,
    query: string,
    options?: {
      limit?: number;
    }
  ): Promise<ContactUi[]> {
    const result = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: {
        '#company_id': 'company_id',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
      },
      limit: 500, // Get more to filter from
    });

    // Filter results based on query
    const filtered = result.items.filter((contact: any) => {
      const searchableText = [
        contact.name,
        contact.first_name,
        contact.last_name,
        contact.phone_number,
        contact.phone,
        contact.email,
      ].join(' ').toLowerCase();
      return searchableText.includes(query.toLowerCase());
    });

    // Return limited results
    return filtered.map((c: any) => this.toUiContact(c)).slice(0, options?.limit || 50);
  }

  async incrementCallCount(companyId: string, contactId: string): Promise<void> {
    const contact = await this.getContactById(companyId, contactId);

    await this.dynamodb.update(
      'contacts',
      { company_id: companyId, contact_id: contactId },
      {
        last_contact_at: Date.now(),
      }
    );
  }

  async getContactAppointments(companyId: string, contactId: string): Promise<any[]> {
    const contact = await this.getContactById(companyId, contactId);
    const phone = normalizePhone(contact.phone_number || (contact as any).phone || '');
    const phoneVariants = buildPhoneVariants(phone);

    const phoneFilters = phoneVariants.map((_, idx) => `#contact_phone = :contact_phone_${idx}`);
    const scan = await this.dynamodb.scan('appointments', {
      filterExpression:
        phoneFilters.length > 0
          ? `#company_id = :company_id AND ( #contact_id = :contact_id OR ${phoneFilters.join(' OR ')} )`
          : '#company_id = :company_id AND #contact_id = :contact_id',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#contact_id': 'contact_id',
        ...(phoneFilters.length > 0 ? { '#contact_phone': 'contact_phone' } : {}),
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':contact_id': contactId,
        ...phoneVariants.reduce<Record<string, string>>((acc, val, idx) => {
          acc[`:contact_phone_${idx}`] = val;
          return acc;
        }, {}),
      },
      limit: 500,
    });

    return (scan.items || []).sort((a: any, b: any) => (a?.scheduled_start ?? 0) - (b?.scheduled_start ?? 0));
  }

  async getContactCalls(
    companyId: string,
    contactId: string,
    options?: { limit?: number; lastEvaluatedKey?: any }
  ): Promise<{ calls: any[]; lastEvaluatedKey?: any; total?: number }> {
    const contact = await this.getContactById(companyId, contactId);
    const phone = normalizePhone(contact.phone_number || (contact as any).phone || '');
    const phoneVariants = buildPhoneVariants(phone);

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const phoneFilters = phoneVariants.map((_, idx) => `#from_number = :phone_${idx}`);
    const expressionAttributeNames: Record<string, string> = {
      '#company_id': 'company_id',
      '#contact_id': 'contact_id',
      ...(phoneFilters.length > 0 ? { '#from_number': 'from_number' } : {}),
    };
    const expressionAttributeValues: Record<string, any> = {
      ':company_id': companyId,
      ':contact_id': contactId,
      ...phoneVariants.reduce<Record<string, string>>((acc, val, idx) => {
        acc[`:phone_${idx}`] = val;
        return acc;
      }, {}),
    };
    const filterExpression =
      phoneFilters.length > 0
        ? `#company_id = :company_id AND (#contact_id = :contact_id OR ${phoneFilters.join(' OR ')})`
        : '#company_id = :company_id AND #contact_id = :contact_id';

    const scan = await this.dynamodb.scan('calls', {
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      limit,
      exclusiveStartKey: options?.lastEvaluatedKey,
    });

    let total: number | undefined;
    try {
      let count = 0;
      let lastKey: Record<string, any> | undefined;
      do {
        const res = await this.dynamodb.scan('calls', {
          filterExpression,
          expressionAttributeNames,
          expressionAttributeValues,
          limit: 1000,
          exclusiveStartKey: lastKey,
          select: 'COUNT',
        });
        count += res.count || 0;
        lastKey = res.lastEvaluatedKey as any;
      } while (lastKey);
      total = count;
    } catch {
      total = undefined;
    }

    const calls = (scan.items || [])
      .sort((a: any, b: any) => (b?.started_at ?? b?.created_at ?? 0) - (a?.started_at ?? a?.created_at ?? 0))
      .slice(0, limit)
      .map((c: any) => ({
        call_id: c.call_id,
        started_at: c.started_at ?? c.created_at,
        duration_seconds: c.duration_seconds ?? c.duration,
        status: c.status,
        summary: c.summary,
      }));
    return { calls, lastEvaluatedKey: scan.lastEvaluatedKey, total };
  }
}

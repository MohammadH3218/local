import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

export interface MessageItem {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  created_at: number;
  status?: string;
  ai_handled?: boolean;
}

export interface MessageThread {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  last_at: number;
  lead_status?: string;
}

@Injectable()
export class MessagesService {
  constructor(private dynamodb: DynamoDBService) {}

  private toContactName(contact: any, fallbackPhone: string) {
    const first = (contact?.first_name ?? '').toString().trim();
    const last = (contact?.last_name ?? '').toString().trim();
    const legacyName = (contact?.name ?? '').toString().trim();
    return legacyName || [first, last].filter(Boolean).join(' ') || fallbackPhone || 'Unknown';
  }

  async listThreads(
    companyId: string,
    options?: { limit?: number; lastEvaluatedKey?: any }
  ): Promise<{ threads: MessageThread[]; lastEvaluatedKey?: any }> {
    const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
    const fetchLimit = Math.min(Math.max(limit * 6, 50), 500);

    let items: any[] = [];
    let lastEvaluatedKey: any;

    try {
      const result = await this.dynamodb.queryByCompany(
        'sms',
        companyId,
        {},
        {
          indexName: 'date-index',
          limit: fetchLimit,
          scanIndexForward: false,
          exclusiveStartKey: options?.lastEvaluatedKey,
        }
      );
      items = result.items || [];
      lastEvaluatedKey = result.lastEvaluatedKey;
    } catch {
      const scan = await this.dynamodb.scan('sms', {
        filterExpression: '#company_id = :company_id',
        expressionAttributeNames: { '#company_id': 'company_id' },
        expressionAttributeValues: { ':company_id': companyId },
        limit: fetchLimit,
        exclusiveStartKey: options?.lastEvaluatedKey,
      });
      items = scan.items || [];
      lastEvaluatedKey = scan.lastEvaluatedKey;
    }

    // Sort newest first and group by contact_id
    items.sort((a, b) => (b?.created_at ?? 0) - (a?.created_at ?? 0));
    const threadsMap = new Map<string, MessageThread>();
    const contactIds: string[] = [];

    for (const item of items) {
      const contactId = item?.contact_id;
      if (!contactId) {
        continue;
      }
      if (!threadsMap.has(contactId)) {
        const phone =
          (item?.direction === 'INBOUND' ? item?.from_number : item?.to_number) ||
          item?.from_number ||
          item?.to_number ||
          '';
        threadsMap.set(contactId, {
          id: contactId,
          contact_name: phone || 'Unknown',
          contact_phone: phone || 'Unknown',
          last_message: item?.message_body || '',
          last_at: Number(item?.created_at ?? 0),
        });
        contactIds.push(contactId);
      }
      if (threadsMap.size >= limit) {
        break;
      }
    }

    if (contactIds.length) {
      const contacts = await Promise.all(
        contactIds.map((contactId) =>
          this.dynamodb.get('contacts', { company_id: companyId, contact_id: contactId })
        )
      );
      contacts.forEach((contact, idx) => {
        const contactId = contactIds[idx];
        const thread = threadsMap.get(contactId);
        if (!thread) return;
        const phone =
          (contact?.phone_number ?? contact?.phone ?? thread.contact_phone ?? '')?.toString();
        threadsMap.set(contactId, {
          ...thread,
          contact_name: this.toContactName(contact, phone),
          contact_phone: phone || thread.contact_phone,
          lead_status: contact?.lead_status,
        });
      });
    }

    const threads = Array.from(threadsMap.values()).sort((a, b) => b.last_at - a.last_at);
    return { threads, lastEvaluatedKey };
  }

  async getThreadMessages(
    companyId: string,
    contactId: string,
    options?: { limit?: number; lastEvaluatedKey?: any }
  ): Promise<{ thread: MessageThread | null; messages: MessageItem[]; lastEvaluatedKey?: any }> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
    const scan = await this.dynamodb.scan('sms', {
      filterExpression: '#company_id = :company_id AND #contact_id = :contact_id',
      expressionAttributeNames: { '#company_id': 'company_id', '#contact_id': 'contact_id' },
      expressionAttributeValues: { ':company_id': companyId, ':contact_id': contactId },
      limit,
      exclusiveStartKey: options?.lastEvaluatedKey,
    });

    const items = (scan.items || []).sort((a, b) => (a?.created_at ?? 0) - (b?.created_at ?? 0));
    const contact = await this.dynamodb.get('contacts', { company_id: companyId, contact_id: contactId });

    const phone =
      (contact?.phone_number ?? contact?.phone ?? items[0]?.from_number ?? items[0]?.to_number ?? '')?.toString();

    const thread: MessageThread | null = contact
      ? {
          id: contactId,
          contact_name: this.toContactName(contact, phone),
          contact_phone: phone || 'Unknown',
          last_message: items.length ? items[items.length - 1]?.message_body || '' : '',
          last_at: items.length ? Number(items[items.length - 1]?.created_at ?? 0) : 0,
          lead_status: contact?.lead_status,
        }
      : items.length
        ? {
            id: contactId,
            contact_name: phone || 'Unknown',
            contact_phone: phone || 'Unknown',
            last_message: items[items.length - 1]?.message_body || '',
            last_at: Number(items[items.length - 1]?.created_at ?? 0),
          }
        : null;

    const messages: MessageItem[] = items.map((item) => ({
      id: item?.sms_id ?? `${item?.created_at ?? ''}`,
      direction: item?.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
      body: item?.message_body || '',
      created_at: Number(item?.created_at ?? 0),
      status: item?.status,
      ai_handled: Boolean(item?.ai_handled),
    }));

    return { thread, messages, lastEvaluatedKey: scan.lastEvaluatedKey };
  }
}

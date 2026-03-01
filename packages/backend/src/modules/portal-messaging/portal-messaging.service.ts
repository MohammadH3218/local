import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PortalMessagingService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  // Get all message threads for a company (pro-side)
  async getProThreads(companyId: string) {
    const scan = await this.dynamodb.scan('portal_messages', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: { '#company_id': 'company_id' },
      expressionAttributeValues: { ':company_id': companyId },
      limit: 200,
    });

    // Group by thread_id
    const threads = new Map<string, any>();
    for (const msg of (scan.items || []) as any[]) {
      const tid = String(msg.thread_id || '');
      if (!tid) continue;
      const existing = threads.get(tid);
      if (!existing || msg.created_at > existing.last_at) {
        threads.set(tid, {
          thread_id: tid,
          customer_name: msg.customer_name || 'Customer',
          customer_email: msg.customer_email,
          last_message: msg.body,
          last_at: msg.created_at,
          unread: msg.direction === 'INBOUND' && !msg.read_at,
        });
      }
    }
    return [...threads.values()].sort((a, b) => b.last_at - a.last_at);
  }

  // Get messages in a thread
  async getThreadMessages(companyId: string, threadId: string) {
    const scan = await this.dynamodb.scan('portal_messages', {
      filterExpression: '#company_id = :company_id AND #thread_id = :thread_id',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#thread_id': 'thread_id',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':thread_id': threadId,
      },
      limit: 200,
    });
    return ((scan.items || []) as any[]).sort((a, b) => a.created_at - b.created_at);
  }

  // Pro sends a message to customer
  async sendProMessage(companyId: string, threadId: string, body: string, customerEmail?: string) {
    const now = Date.now();
    const messageId = `${now}-${uuidv4()}`;

    await this.dynamodb.put('portal_messages', {
      company_id: companyId,
      message_id: messageId,
      thread_id: threadId,
      direction: 'OUTBOUND',
      body,
      customer_email: customerEmail,
      created_at: now,
      updated_at: now,
    });

    return { message_id: messageId, body, direction: 'OUTBOUND', created_at: now };
  }

  // Customer sends a message (uses company_id of the pro they're messaging)
  async sendCustomerMessage(companyId: string, threadId: string, body: string, customerName?: string, customerEmail?: string) {
    const now = Date.now();
    const messageId = `${now}-${uuidv4()}`;

    await this.dynamodb.put('portal_messages', {
      company_id: companyId,
      message_id: messageId,
      thread_id: threadId,
      direction: 'INBOUND',
      body,
      customer_name: customerName,
      customer_email: customerEmail,
      created_at: now,
      updated_at: now,
    });

    return { message_id: messageId, body, direction: 'INBOUND', created_at: now };
  }

  // Customer gets their threads (across all companies)
  async getCustomerThreads(customerEmail: string) {
    const scan = await this.dynamodb.scan('portal_messages', {
      filterExpression: '#customer_email = :email',
      expressionAttributeNames: { '#customer_email': 'customer_email' },
      expressionAttributeValues: { ':email': customerEmail },
      limit: 200,
    });

    const threads = new Map<string, any>();
    for (const msg of (scan.items || []) as any[]) {
      const tid = String(msg.thread_id || '');
      if (!tid) continue;
      const existing = threads.get(tid);
      if (!existing || msg.created_at > existing.last_at) {
        threads.set(tid, {
          thread_id: tid,
          company_id: msg.company_id,
          last_message: msg.body,
          last_at: msg.created_at,
          direction: msg.direction,
        });
      }
    }
    return [...threads.values()].sort((a, b) => b.last_at - a.last_at);
  }

  // Create or get thread ID for a company+customer pair
  getThreadId(companyId: string, customerEmail: string): string {
    const key = `${companyId}::${customerEmail}`;
    return Buffer.from(key).toString('base64url').slice(0, 32);
  }
}

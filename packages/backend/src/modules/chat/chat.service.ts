import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactSource, LeadStatus, PLAN_FEATURES, SubscriptionPlan } from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateChatSessionDto, RequestCallbackDto, SendChatMessageDto } from './dto/chat-widget.dto';

type ChatMessage = {
  id: string;
  role: 'visitor' | 'assistant' | 'system';
  text: string;
  created_at: number;
};

type ChatSessionRecord = {
  company_id: string;
  session_id: string;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  status: 'OPEN' | 'CLOSED';
  visitor_name?: string;
  visitor_phone?: string;
  visitor_email?: string;
  page_url?: string;
  user_agent?: string;
  callback_requested_at?: number;
  callback_note?: string;
  messages: ChatMessage[];
};

@Injectable()
export class ChatService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
    private readonly knowledge: KnowledgeService,
    private readonly webhooks: WebhooksService,
  ) {}

  async getWidgetConfig(companyId: string): Promise<{
    enabled: boolean;
    company_id: string;
    company_name?: string;
    greeting: string;
    primary_color: string;
    position: 'BOTTOM_RIGHT' | 'BOTTOM_LEFT';
  }> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    const plan = this.resolvePlan(company.subscription_plan);
    const planAllowsWidget = PLAN_FEATURES[plan].website_widget === true;

    return {
      enabled: Boolean(planAllowsWidget && company.website_widget_enabled),
      company_id: company.company_id,
      company_name: company.company_name,
      greeting:
        company.website_widget_settings?.greeting ||
        `Hi there! I'm the AI assistant for ${company.company_name}. How can I help today?`,
      primary_color: company.website_widget_settings?.primary_color || '#10b981',
      position: company.website_widget_settings?.position || 'BOTTOM_RIGHT',
    };
  }

  async createSession(dto: CreateChatSessionDto): Promise<{
    ok: true;
    session_id: string;
    created_at: number;
    greeting: string;
  }> {
    const company = await this.getEnabledCompany(dto.company_id);
    const now = Date.now();
    const sessionId = uuidv4();
    const greeting =
      company.website_widget_settings?.greeting ||
      `Hi there! I'm the AI assistant for ${company.company_name}. How can I help today?`;

    const record: ChatSessionRecord = {
      company_id: company.company_id,
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      last_message_at: now,
      status: 'OPEN',
      visitor_name: this.clean(dto.visitor_name, 120),
      visitor_phone: this.cleanPhone(dto.visitor_phone),
      visitor_email: this.clean(dto.visitor_email, 180),
      page_url: this.clean(dto.page_url, 500),
      user_agent: this.clean(dto.user_agent, 300),
      messages: [
        {
          id: uuidv4(),
          role: 'assistant',
          text: greeting,
          created_at: now,
        },
      ],
    };

    await this.putSession(record);
    return {
      ok: true,
      session_id: sessionId,
      created_at: now,
      greeting,
    };
  }

  async sendMessage(dto: SendChatMessageDto): Promise<{
    ok: true;
    session_id: string;
    reply: string;
    callback_requested: boolean;
    messages: ChatMessage[];
  }> {
    const company = await this.getEnabledCompany(dto.company_id);
    const text = this.clean(dto.message, 2000);
    if (!text) throw new BadRequestException('message is required');

    const now = Date.now();
    let session = dto.session_id
      ? await this.getSession(company.company_id, dto.session_id)
      : null;

    if (!session) {
      const created = await this.createSession({
        company_id: company.company_id,
        visitor_name: dto.visitor_name,
        visitor_phone: dto.visitor_phone,
        visitor_email: dto.visitor_email,
        page_url: dto.page_url,
        user_agent: dto.user_agent,
      });
      session = await this.getSession(company.company_id, created.session_id);
      if (!session) throw new Error('Failed to initialize chat session');
    }

    session.visitor_name = this.clean(dto.visitor_name, 120) || session.visitor_name;
    session.visitor_phone = this.cleanPhone(dto.visitor_phone) || session.visitor_phone;
    session.visitor_email = this.clean(dto.visitor_email, 180) || session.visitor_email;
    session.page_url = this.clean(dto.page_url, 500) || session.page_url;
    session.user_agent = this.clean(dto.user_agent, 300) || session.user_agent;

    session.messages.push({
      id: uuidv4(),
      role: 'visitor',
      text,
      created_at: now,
    });

    let callbackRequested = false;
    let reply = '';

    if (this.looksLikeCallbackRequest(text)) {
      if (!session.visitor_phone) {
        reply = 'I can help with that. Share the best phone number and we will call you back.';
      } else {
        await this.createOrUpdateLead(company.company_id, {
          name: session.visitor_name,
          phone: session.visitor_phone,
          email: session.visitor_email,
          note: `Website widget callback request from chat session ${session.session_id}`,
        });
        session.callback_requested_at = now;
        callbackRequested = true;
        reply = 'Thanks. We received your callback request and our team will reach out shortly.';
      }
    } else {
      reply = await this.buildAssistantReply(company.company_id, text, company.company_name);
    }

    session.messages.push({
      id: uuidv4(),
      role: 'assistant',
      text: reply,
      created_at: Date.now(),
    });
    session.updated_at = Date.now();
    session.last_message_at = session.updated_at;

    await this.putSession(session);

    return {
      ok: true,
      session_id: session.session_id,
      reply,
      callback_requested: callbackRequested,
      messages: session.messages.slice(-20),
    };
  }

  async requestCallback(dto: RequestCallbackDto): Promise<{
    ok: true;
    session_id: string;
    message: string;
  }> {
    const company = await this.getEnabledCompany(dto.company_id);
    const now = Date.now();

    const phone = this.cleanPhone(dto.visitor_phone);
    if (!phone) {
      throw new BadRequestException('visitor_phone is required');
    }

    let session = dto.session_id
      ? await this.getSession(company.company_id, dto.session_id)
      : null;

    if (!session) {
      const created = await this.createSession({
        company_id: company.company_id,
        visitor_name: dto.visitor_name,
        visitor_phone: phone,
        visitor_email: dto.visitor_email,
      });
      session = await this.getSession(company.company_id, created.session_id);
      if (!session) throw new Error('Failed to initialize chat session');
    }

    const note = this.clean(dto.note, 2000);
    await this.createOrUpdateLead(company.company_id, {
      name: this.clean(dto.visitor_name, 120),
      phone,
      email: this.clean(dto.visitor_email, 180),
      note: note || `Website widget callback request from chat session ${session.session_id}`,
    });

    session.visitor_name = this.clean(dto.visitor_name, 120) || session.visitor_name;
    session.visitor_phone = phone;
    session.visitor_email = this.clean(dto.visitor_email, 180) || session.visitor_email;
    session.callback_requested_at = now;
    session.callback_note = note || undefined;
    session.messages.push({
      id: uuidv4(),
      role: 'system',
      text: 'Callback requested by visitor.',
      created_at: now,
    });
    session.updated_at = now;
    session.last_message_at = now;

    await this.putSession(session);

    return {
      ok: true,
      session_id: session.session_id,
      message: 'Callback request submitted.',
    };
  }

  private async getEnabledCompany(companyId: string) {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    const plan = this.resolvePlan(company.subscription_plan);
    if (!PLAN_FEATURES[plan].website_widget) {
      throw new ForbiddenException('Website chat widget is available on the Max plan');
    }
    if (!company.website_widget_enabled) {
      throw new ForbiddenException('Website chat widget is not enabled for this company');
    }
    return company;
  }

  private async getSession(companyId: string, sessionId: string): Promise<ChatSessionRecord | null> {
    const item = await this.dynamodb.get('chat_sessions', {
      company_id: companyId,
      session_id: sessionId,
    });
    return (item as ChatSessionRecord | null) || null;
  }

  private async putSession(session: ChatSessionRecord) {
    const trimmedMessages = Array.isArray(session.messages)
      ? session.messages.slice(-60)
      : [];

    await this.dynamodb.put('chat_sessions', {
      ...session,
      messages: trimmedMessages,
      updated_at: Date.now(),
      last_message_at: session.last_message_at || Date.now(),
    } as any);
  }

  private async buildAssistantReply(
    companyId: string,
    message: string,
    companyName: string,
  ): Promise<string> {
    try {
      const matches = await this.knowledge.searchKnowledge(companyId, message, 3);
      const top = matches.find((item) => Number(item.similarity || 0) >= 0.35) || matches[0];
      if (top) {
        const sourceText = this.clean(top.text, 700) || this.clean(top.item?.content, 700);
        if (sourceText) return sourceText;
      }
    } catch {
      // Best effort: fallback response below.
    }

    return `Thanks for your message to ${companyName}. I can help with questions, scheduling, and callback requests. If you'd like a callback, reply with your phone number.`;
  }

  private async createOrUpdateLead(
    companyId: string,
    input: { name?: string; phone: string; email?: string; note?: string },
  ): Promise<void> {
    const existing = await this.findContactByPhone(companyId, input.phone);
    const now = Date.now();

    if (existing?.contact_id) {
      const [firstName, ...rest] = String(input.name || '').trim().split(/\s+/).filter(Boolean);
      await this.dynamodb.update(
        'contacts',
        { company_id: companyId, contact_id: existing.contact_id },
        {
          ...(firstName ? { first_name: firstName } : {}),
          ...(rest.length ? { last_name: rest.join(' ') } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.note ? { notes: input.note } : {}),
          lead_status: existing.lead_status || LeadStatus.NEW,
          last_contact_at: now,
          updated_at: now,
        },
      );

      void this.webhooks.emitEvent(companyId, 'contact.updated', {
        contact: {
          contact_id: existing.contact_id,
          phone_number: input.phone,
          email: input.email,
        },
      });
      return;
    }

    const contactId = uuidv4();
    const [firstName, ...rest] = String(input.name || '').trim().split(/\s+/).filter(Boolean);
    const contact = {
      company_id: companyId,
      contact_id: contactId,
      phone_number: input.phone,
      email: input.email,
      first_name: firstName || undefined,
      last_name: rest.length ? rest.join(' ') : undefined,
      source: ContactSource.MANUAL,
      lead_status: LeadStatus.NEW,
      notes: input.note,
      created_at: now,
      updated_at: now,
      last_contact_at: now,
    };
    await this.dynamodb.put('contacts', contact as any);

    void this.webhooks.emitEvent(companyId, 'contact.created', {
      contact: {
        contact_id: contactId,
        phone_number: input.phone,
        first_name: firstName || undefined,
        last_name: rest.length ? rest.join(' ') : undefined,
        email: input.email,
      },
    });
  }

  private async findContactByPhone(companyId: string, phone: string): Promise<any | null> {
    const scan = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id AND #phone_number = :phone_number',
      expressionAttributeNames: {
        '#company_id': 'company_id',
        '#phone_number': 'phone_number',
      },
      expressionAttributeValues: {
        ':company_id': companyId,
        ':phone_number': phone,
      },
      limit: 1,
    });
    return (scan.items?.[0] as any) || null;
  }

  private looksLikeCallbackRequest(text: string): boolean {
    const message = String(text || '').toLowerCase();
    return (
      message.includes('call me') ||
      message.includes('callback') ||
      message.includes('call back') ||
      message.includes('give me a call')
    );
  }

  private clean(value?: string, maxLen = 500): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, maxLen);
  }

  private cleanPhone(value?: string): string | undefined {
    if (!value) return undefined;
    const digits = value.replace(/[^\d+]/g, '');
    if (!digits) return undefined;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  private resolvePlan(rawPlan?: string | null): SubscriptionPlan {
    const candidate = String(rawPlan || '').toUpperCase();
    if (Object.values(SubscriptionPlan).includes(candidate as SubscriptionPlan)) {
      return candidate as SubscriptionPlan;
    }
    return SubscriptionPlan.STARTER;
  }
}

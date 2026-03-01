import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';
import { TelephonyService } from '../telephony/telephony.service';
import { UsageGateService } from '../billing/usage-gate.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { SendCampaignDto, SendSingleSmsDto } from './dto/send-campaign.dto';

@Injectable()
export class SmsAutomationService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly telephony: TelephonyService,
    private readonly usageGate: UsageGateService,
  ) {}

  // ──── TEMPLATE MANAGEMENT ────────────────────────────────────────────────

  async createTemplate(companyId: string, dto: CreateTemplateDto) {
    const now = Date.now();
    const templateId = uuidv4();
    const item = {
      company_id: companyId,
      template_id: templateId,
      name: dto.name,
      category: dto.category,
      body: dto.body,
      created_at: now,
      updated_at: now,
    };
    await this.dynamodb.put('sms_templates', item);
    return item;
  }

  async listTemplates(companyId: string) {
    const result = await this.dynamodb.query(
      'sms_templates',
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId },
      { limit: 100 },
    );
    return result.items || [];
  }

  async getTemplate(companyId: string, templateId: string) {
    const item = await this.dynamodb.get('sms_templates', { company_id: companyId, template_id: templateId });
    if (!item) throw new NotFoundException('Template not found');
    return item;
  }

  async updateTemplate(companyId: string, templateId: string, dto: UpdateTemplateDto) {
    await this.getTemplate(companyId, templateId);
    const updates: Record<string, any> = { updated_at: Date.now() };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.body !== undefined) updates.body = dto.body;
    await this.dynamodb.update('sms_templates', { company_id: companyId, template_id: templateId }, updates);
    return this.getTemplate(companyId, templateId);
  }

  async deleteTemplate(companyId: string, templateId: string) {
    await this.getTemplate(companyId, templateId);
    await this.dynamodb.delete('sms_templates', { company_id: companyId, template_id: templateId });
    return { deleted: true };
  }

  // ──── COMPLIANCE CHECKS ───────────────────────────────────────────────────

  private isWithinQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    // Quiet hours: 9pm - 8am
    return hour >= 21 || hour < 8;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }

  // ──── CAMPAIGN SEND ───────────────────────────────────────────────────────

  async sendCampaign(
    companyId: string,
    dto: SendCampaignDto,
  ): Promise<{ scheduled: number; immediate: number; skipped: number }> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    const template = await this.getTemplate(companyId, dto.template_id);
    const now = Date.now();
    const scheduledAt = dto.scheduled_at || now;
    const isImmediate = scheduledAt <= now + 60_000;

    let scheduled = 0;
    let immediate = 0;
    let skipped = 0;

    for (const contactId of dto.contact_ids) {
      try {
        const contact = await this.contacts.getContactById(companyId, contactId);
        if (!contact?.phone_number && !(contact as any)?.phone) {
          skipped++;
          continue;
        }

        const toNumber = (contact as any).phone_number || (contact as any).phone;
        const body = this.renderTemplate((template as any).body, {
          company_name: company.company_name || 'our team',
          contact_name: (contact as any).name || (contact as any).first_name || 'there',
        });

        if (isImmediate) {
          if (this.isWithinQuietHours()) {
            // Schedule for 8am instead
            const tomorrow8am = new Date();
            tomorrow8am.setHours(8, 0, 0, 0);
            if (tomorrow8am.getTime() <= now) tomorrow8am.setDate(tomorrow8am.getDate() + 1);
            await this.scheduleMessage(companyId, contactId, toNumber, body, tomorrow8am.getTime(), dto.template_id);
            scheduled++;
          } else {
            const allowed = await this.usageGate.isServiceAllowed(companyId, 'sms');
            if (!allowed) { skipped++; continue; }
            await this.telephony.sendSms(toNumber, body);
            immediate++;
          }
        } else {
          await this.scheduleMessage(companyId, contactId, toNumber, body, scheduledAt, dto.template_id);
          scheduled++;
        }
      } catch {
        skipped++;
      }
    }

    return { scheduled, immediate, skipped };
  }

  async sendSingle(companyId: string, dto: SendSingleSmsDto): Promise<{ sid: string; status: string }> {
    const allowed = await this.usageGate.isServiceAllowed(companyId, 'sms');
    if (!allowed) throw new BadRequestException('SMS limit reached. Upgrade your plan.');

    if (this.isWithinQuietHours()) {
      throw new BadRequestException('Cannot send SMS during quiet hours (9pm–8am). Schedule for later.');
    }

    const result = await this.telephony.sendSms(dto.to_number, dto.body);
    return { sid: result.sid || '', status: result.status || 'sent' };
  }

  private async scheduleMessage(
    companyId: string,
    contactId: string,
    toNumber: string,
    body: string,
    sendAt: number,
    templateId: string,
  ) {
    const now = Date.now();
    await this.dynamodb.put('scheduled_messages', {
      company_id: companyId,
      message_id: `${sendAt}-${uuidv4()}`,
      contact_id: contactId,
      to_number: toNumber,
      channel: 'SMS',
      message_type: 'CAMPAIGN',
      template_id: templateId,
      body,
      send_at: sendAt,
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    });
  }

  // ──── SCHEDULED MESSAGES ─────────────────────────────────────────────────

  async listScheduledMessages(companyId: string, options?: { status?: string; limit?: number }) {
    const filters: Record<string, any> = { ':company_id': companyId };
    const names: Record<string, string> = { '#company_id': 'company_id' };
    let filterExpr = '#company_id = :company_id';

    if (options?.status) {
      filters[':status'] = options.status;
      names['#status'] = 'status';
      filterExpr += ' AND #status = :status';
    }

    const result = await this.dynamodb.scan('scheduled_messages', {
      filterExpression: filterExpr,
      expressionAttributeNames: names,
      expressionAttributeValues: filters,
      limit: options?.limit || 50,
    });

    return result.items || [];
  }

  async cancelScheduledMessage(companyId: string, messageId: string) {
    const items = await this.dynamodb.scan('scheduled_messages', {
      filterExpression: '#company_id = :company_id AND #message_id = :message_id',
      expressionAttributeNames: { '#company_id': 'company_id', '#message_id': 'message_id' },
      expressionAttributeValues: { ':company_id': companyId, ':message_id': messageId },
      limit: 1,
    });

    if (!items.items?.length) throw new NotFoundException('Scheduled message not found');
    const item = items.items[0] as any;
    if (item.status !== 'PENDING') throw new BadRequestException('Can only cancel PENDING messages');

    await this.dynamodb.update(
      'scheduled_messages',
      { company_id: companyId, message_id: messageId },
      { status: 'CANCELLED', updated_at: Date.now() },
    );
    return { cancelled: true };
  }

  private renderTemplate(template: string, values: Record<string, string>): string {
    let rendered = String(template || '').trim();
    for (const [key, value] of Object.entries(values)) {
      rendered = rendered.split(`{{${key}}}`).join(String(value || ''));
    }
    return rendered;
  }
}

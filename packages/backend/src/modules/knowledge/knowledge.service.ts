import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { RagService } from '../rag/rag.service';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { CompaniesService } from '../companies/companies.service';
import { ParameterStoreService } from '../../infrastructure/config/parameter-store.service';
import { ServiceProductsService } from '../billing/service-products.service';

export interface KnowledgeItem {
  company_id: string;
  knowledge_id: string;
  title: string;
  content: string;
  type: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  source?: string;
  tags?: string[];
  created_at: number;
  updated_at: number;
}

export interface CreateKnowledgeDto {
  title: string;
  content: string;
  type: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
  source?: string;
  tags?: string[];
}

export interface UpdateKnowledgeDto {
  title?: string;
  content?: string;
  type?: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags?: string[];
}

type AssistantRole = 'user' | 'assistant';
type KnowledgeType = 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';

export type KnowledgeAssistantMessage = {
  role: AssistantRole;
  content: string;
};

export type KnowledgeAssistantReply = {
  assistant_message: string;
  done: boolean;
  missing_topics: string[];
  gathered_topics: string[];
};

export type GeneratedKnowledgeDraft = {
  title: string;
  content: string;
  type: KnowledgeType;
  tags?: string[];
};

@Injectable()
export class KnowledgeService implements OnModuleInit {
  private tableName: string;
  private openai: OpenAI;
  private knowledgeAssistantModelId: string;

  constructor(
    private dynamodb: DynamoDBService,
    private ragService: RagService,
    private configService: ConfigService,
    private companiesService: CompaniesService,
    private parameterStore: ParameterStoreService,
    private serviceProductsService: ServiceProductsService,
  ) {
    // Use the base table name and let the shared DynamoDB service prepend the configured prefix
    this.tableName = 'knowledge_items';
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      console.warn(
        '[KnowledgeService] OPENAI_API_KEY not in env — will attempt to load from Parameter Store on init.',
      );
    }
    this.openai = new OpenAI({ apiKey: apiKey || 'dummy' });
    this.knowledgeAssistantModelId =
      this.configService.get<string>('KNOWLEDGE_SETUP_MODEL_ID') || 'gpt-4.1-nano';
  }

  async onModuleInit() {
    // Env var takes priority; only fetch from SSM if not already set
    const envKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!envKey) {
      const ssmKey = await this.parameterStore.getOpenAIApiKey();
      if (ssmKey) {
        this.openai = new OpenAI({ apiKey: ssmKey });
        console.log('[KnowledgeService] OpenAI client initialized from Parameter Store.');
      } else {
        console.error('[KnowledgeService] OPENAI_API_KEY not found in env or Parameter Store. Knowledge AI will be unavailable.');
      }
    }
  }

  /**
   * Create a new knowledge item with automatic chunking and embedding
   */
  async createKnowledgeItem(
    companyId: string,
    data: CreateKnowledgeDto,
  ): Promise<KnowledgeItem> {
    try {
      const knowledgeId = uuidv4();
      const now = Date.now();

      const knowledgeItem: KnowledgeItem = {
        company_id: companyId,
        knowledge_id: knowledgeId,
        title: data.title,
        content: data.content,
        type: data.type,
        status: 'ACTIVE',
        source: data.source,
        tags: data.tags || [],
        created_at: now,
        updated_at: now,
      };

      // Store knowledge item in DynamoDB
      await this.dynamodb.put(this.tableName, {
        ...knowledgeItem,
        type_created: `${data.type}#${now}`, // GSI sort key
        status_updated: `${knowledgeItem.status}#${now}`, // GSI sort key
      });

      // Chunk and embed the content using RAG service
      const fullText = `${data.title}\n\n${data.content}`;
      try {
        await this.ragService.chunkAndStoreKnowledge(companyId, knowledgeId, fullText);
      } catch (embedError: any) {
        // RAG/embeddings are optional; allow creating knowledge even if embedding infra isn't configured.
        console.warn('[KnowledgeService] Failed to embed knowledge item; created without embeddings.', embedError);
      }

      return knowledgeItem;
    } catch (error: any) {
      console.error('Error creating knowledge item:', error);
      throw new Error(`Failed to create knowledge item: ${error.message}`);
    }
  }

  /**
   * Update an existing knowledge item and re-chunk if content changed
   */
  async updateKnowledgeItem(
    companyId: string,
    knowledgeId: string,
    data: UpdateKnowledgeDto,
  ): Promise<KnowledgeItem> {
    try {
      // Get existing item
      const existing = await this.getKnowledgeItem(companyId, knowledgeId);
      if (!existing) {
        throw new NotFoundException(`Knowledge item ${knowledgeId} not found`);
      }

      const now = Date.now();
      const contentChanged = data.content && data.content !== existing.content;

      // Update fields
      const updated: KnowledgeItem = {
        ...existing,
        ...data,
        updated_at: now,
      };

      // Update in DynamoDB
      await this.dynamodb.update(
        this.tableName,
        { company_id: companyId, knowledge_id: knowledgeId },
        {
          ...data,
          updated_at: now,
          ...(data.status && { status_updated: `${data.status}#${now}` }),
          ...(data.type && { type_created: `${data.type}#${existing.created_at}` }),
        },
      );

      // If content changed, re-chunk and re-embed
      if (contentChanged) {
        try {
          // Delete old chunks
          await this.ragService.deleteKnowledgeChunks(companyId, knowledgeId);

          // Create new chunks
          const fullText = `${updated.title}\n\n${updated.content}`;
          await this.ragService.chunkAndStoreKnowledge(companyId, knowledgeId, fullText);
        } catch (embedError: any) {
          console.warn('[KnowledgeService] Failed to re-embed knowledge item after update.', embedError);
        }
      }

      return updated;
    } catch (error: any) {
      console.error('Error updating knowledge item:', error);
      throw new Error(`Failed to update knowledge item: ${error.message}`);
    }
  }

  /**
   * Delete a knowledge item and all its chunks
   */
  async deleteKnowledgeItem(companyId: string, knowledgeId: string): Promise<void> {
    try {
      // Delete chunks first (best-effort: knowledge items should be deletable even if RAG is unavailable)
      try {
        await this.ragService.deleteKnowledgeChunks(companyId, knowledgeId);
      } catch (ragError: any) {
        console.warn('[KnowledgeService] Failed to delete knowledge chunks; continuing delete.', ragError);
      }

      // Delete knowledge item
      await this.dynamodb.delete(this.tableName, {
        company_id: companyId,
        knowledge_id: knowledgeId,
      });
    } catch (error: any) {
      console.error('Error deleting knowledge item:', error);
      throw new Error(`Failed to delete knowledge item: ${error.message}`);
    }
  }

  /**
   * Get a single knowledge item
   */
  async getKnowledgeItem(
    companyId: string,
    knowledgeId: string,
  ): Promise<KnowledgeItem | null> {
    try {
      const item = await this.dynamodb.get(this.tableName, {
        company_id: companyId,
        knowledge_id: knowledgeId,
      });

      return (item as KnowledgeItem) || null;
    } catch (error: any) {
      console.error('Error getting knowledge item:', error);
      throw new Error(`Failed to get knowledge item: ${error.message}`);
    }
  }

  /**
   * List all knowledge items for a company
   */
  async listKnowledgeItems(
    companyId: string,
    filters?: {
      type?: string;
      status?: string;
      limit?: number;
    },
  ): Promise<KnowledgeItem[]> {
    try {
      const filterPieces: string[] = [];
      const expressionAttributeNames: Record<string, string> = {
        '#company_id': 'company_id',
      };
      const expressionAttributeValues: Record<string, any> = {
        ':company_id': companyId,
      };

      if (filters?.type) {
        filterPieces.push('#type = :type');
        expressionAttributeNames['#type'] = 'type';
        expressionAttributeValues[':type'] = filters.type;
      }
      if (filters?.status) {
        filterPieces.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = filters.status;
      }

      const filterExpression = filterPieces.length > 0 ? filterPieces.join(' AND ') : undefined;

      let result;
      try {
        // Prefer a company-scoped query; it will use the base PK and apply filterExpression if provided.
        result = await this.dynamodb.queryByCompany(
          this.tableName,
          companyId,
          {
            filterExpression,
            expressionAttributeNames,
            expressionAttributeValues,
          },
          {
            limit: filters?.limit,
          },
        );
      } catch (queryError) {
        console.warn('[KnowledgeService] Falling back to scan for knowledge items:', queryError);
        // Fallback to scan if the index/key condition is not available in the deployed table
        result = await this.dynamodb.scan(this.tableName, {
          filterExpression: ['#company_id = :company_id', filterExpression].filter(Boolean).join(' AND '),
          expressionAttributeNames,
          expressionAttributeValues,
          limit: filters?.limit,
        });
      }

      // Sort newest first by updated_at to keep UI stable
      const items = ((result.items || []) as KnowledgeItem[]).sort(
        (a, b) => (b?.updated_at || 0) - (a?.updated_at || 0),
      );

      return filters?.limit ? items.slice(0, filters.limit) : items;
    } catch (error: any) {
      console.error('Error listing knowledge items:', error);
      throw new Error(`Failed to list knowledge items: ${error.message}`);
    }
  }

  async assistantRespond(
    companyId: string,
    messages: KnowledgeAssistantMessage[],
  ): Promise<KnowledgeAssistantReply> {
    const cleanMessages = this.sanitizeAssistantMessages(messages);
    const companyContext = await this.buildAssistantCompanyContext(companyId);
    const existing = await this.listKnowledgeItems(companyId, { limit: 120 });
    const existingTitles = existing.slice(0, 30).map((item) => item.title);

    const systemPrompt = [
      'You are HandyCall Knowledge Setup Assistant.',
      'Goal: collect business-specific knowledge so an AI receptionist can answer accurately and book correctly.',
      'Ask one focused follow-up question at a time, unless enough detail is already gathered.',
      'Adapt to the business type and avoid assumptions. If unknown, ask.',
      'Keep assistant_message under 120 words.',
      'Mark done=true only when the knowledge base can be generated with strong coverage.',
      'Important coverage checklist:',
      '- Services and add-ons',
      '- One-time vs subscription options (if applicable)',
      '- Pricing ranges and what is included',
      '- Service area and availability windows',
      '- Booking and cancellation rules',
      '- Payment flow (HandyCall managed vs self-managed)',
      '- Guarantees, warranties, and exclusions',
      '- Emergency/after-hours handling',
      '- Prep instructions and customer expectations',
      '- Upsell/cross-sell opportunities by service type',
      'Return strict JSON with this exact shape:',
      '{"assistant_message":"string","done":boolean,"missing_topics":["string"],"gathered_topics":["string"]}',
      'Never include markdown code fences.',
    ].join('\n');

    const payload = {
      company_context: companyContext,
      service_type_hints: this.buildServiceTypeHints(companyContext.service_type),
      existing_knowledge_titles: existingTitles,
      conversation: cleanMessages,
      fallback_behavior:
        'If conversation is empty, greet briefly and ask the highest-priority first question.',
    };

    const json = await this.callJsonModel(systemPrompt, payload);
    const fallback: KnowledgeAssistantReply = {
      assistant_message:
        'Tell me the top 3 services you offer and whether each is one-time, subscription, or both.',
      done: false,
      missing_topics: ['services', 'billing model', 'pricing'],
      gathered_topics: [],
    };
    const parsed = this.parseAssistantReply(json, fallback);

    if (!parsed.assistant_message.trim()) {
      parsed.assistant_message = fallback.assistant_message;
      parsed.done = false;
    }

    return parsed;
  }

  async generateKnowledgeFromConversation(
    companyId: string,
    messages: KnowledgeAssistantMessage[],
    autoCreate: boolean,
  ): Promise<{
    generated_count: number;
    created_count: number;
    updated_count: number;
    items: GeneratedKnowledgeDraft[];
  }> {
    const cleanMessages = this.sanitizeAssistantMessages(messages);
    const userTurns = cleanMessages.filter((m) => m.role === 'user');
    if (userTurns.length < 2) {
      throw new BadRequestException('Please answer at least two assistant questions before generating knowledge.');
    }

    const companyContext = await this.buildAssistantCompanyContext(companyId);
    const existing = await this.listKnowledgeItems(companyId, { limit: 250 });

    const systemPrompt = [
      'You generate a structured knowledge base for an AI receptionist.',
      'Use only the provided context + conversation. Do not invent unavailable facts.',
      'If key data is missing, create a POLICY item explicitly stating "Needs confirmation" for that point.',
      'Generate between 8 and 18 items.',
      'Each item must include:',
      '- title',
      '- content',
      '- type (FAQ | SERVICE | POLICY | PRODUCT | SAFETY)',
      '- tags (array of short lowercase tokens)',
      'Ensure coverage for:',
      '- Service catalog and add-ons',
      '- One-time vs subscription options and inclusions',
      '- Pricing model and estimate policy',
      '- Booking, cancellation, and reschedule policy',
      '- Payment handling expectations',
      '- Service area / availability',
      '- Guarantees / exclusions',
      '- Escalation and edge-case guidance',
      'Keep content concise but operational (2-8 sentences).',
      'Return strict JSON with shape:',
      '{"items":[{"title":"string","content":"string","type":"FAQ|SERVICE|POLICY|PRODUCT|SAFETY","tags":["string"]}]}',
      'Never include markdown code fences.',
    ].join('\n');

    const payload = {
      company_context: companyContext,
      service_type_hints: this.buildServiceTypeHints(companyContext.service_type),
      conversation: cleanMessages,
      existing_knowledge_titles: existing.slice(0, 60).map((item) => item.title),
    };

    const json = await this.callJsonModel(systemPrompt, payload);
    const drafts = this.parseGeneratedItems(json);
    if (!drafts.length) {
      throw new BadRequestException('Assistant could not generate knowledge items from the provided answers.');
    }

    if (!autoCreate) {
      return {
        generated_count: drafts.length,
        created_count: 0,
        updated_count: 0,
        items: drafts,
      };
    }

    const upsertResult = await this.upsertGeneratedKnowledgeItems(companyId, drafts, existing);
    return {
      generated_count: drafts.length,
      created_count: upsertResult.created,
      updated_count: upsertResult.updated,
      items: drafts,
    };
  }

  private async upsertGeneratedKnowledgeItems(
    companyId: string,
    drafts: GeneratedKnowledgeDraft[],
    existingItems?: KnowledgeItem[],
  ): Promise<{ created: number; updated: number }> {
    const existing = Array.isArray(existingItems)
      ? existingItems
      : await this.listKnowledgeItems(companyId, { limit: 400 });
    const byTitle = new Map(
      existing.map((item) => [item.title.trim().toLowerCase(), item] as const),
    );

    let created = 0;
    let updated = 0;
    for (const draft of drafts) {
      const normalizedTitle = draft.title.trim().toLowerCase();
      const match = byTitle.get(normalizedTitle);
      if (match?.knowledge_id) {
        await this.updateKnowledgeItem(companyId, match.knowledge_id, {
          title: draft.title,
          content: draft.content,
          type: draft.type,
          status: 'ACTIVE',
          tags: draft.tags || [],
        });
        updated += 1;
      } else {
        await this.createKnowledgeItem(companyId, {
          title: draft.title,
          content: draft.content,
          type: draft.type,
          tags: draft.tags || [],
          source: 'ai-setup-assistant',
        });
        created += 1;
      }
    }
    return { created, updated };
  }

  private async buildAssistantCompanyContext(companyId: string): Promise<Record<string, any>> {
    const company = await this.companiesService.findById(companyId);
    const serviceNames = Array.isArray(company?.booking_services)
      ? company.booking_services
          .filter((service: any) => service?.active !== false)
          .slice(0, 20)
          .map((service: any) => ({
            name: service?.name,
            description: service?.description,
            amount_cents: service?.amount_cents,
            billing_type: service?.billing_type || 'ONE_TIME',
            collect_payment: service?.collect_payment !== false,
          }))
      : [];

    return {
      company_name: company?.company_name || 'Unknown company',
      service_type: String(company?.service_type || 'OTHER'),
      timezone: company?.timezone || 'America/New_York',
      business_hours: company?.business_hours || null,
      service_area_zipcodes: company?.service_area_zipcodes || [],
      service_area_cities: company?.service_area_cities || [],
      pricing_profile: company?.pricing_profile || null,
      booking_payment_mode: company?.booking_payment_mode || 'HANDYCALL_MANAGED',
      booking_payment_enabled: company?.booking_payment_enabled !== false,
      booking_services: serviceNames,
    };
  }

  private buildServiceTypeHints(serviceType: string): string[] {
    const key = String(serviceType || 'OTHER').toUpperCase();
    const hints: Record<string, string[]> = {
      PEST_CONTROL: [
        'Clarify one-time treatment vs recurring plan cadence (monthly/quarterly).',
        'Capture pest types, property type, square footage bands, and retreat policy.',
      ],
      LAWN_CARE: [
        'Capture mowing frequency, seasonal services, and add-ons like edging or fertilization.',
        'Clarify whether subscriptions include weed control, aeration, and reseeding.',
      ],
      LANDSCAPING: [
        'Differentiate recurring maintenance from project-based work.',
        'Capture add-ons such as mulch, shrub trimming, cleanup, irrigation, and tree work.',
      ],
      HVAC: [
        'Clarify diagnostics fee, repair vs maintenance plans, and emergency response windows.',
        'Capture plan benefits such as priority scheduling and seasonal tune-ups.',
      ],
      PLUMBING: [
        'Capture trip fee, emergency surcharge, and membership plan perks.',
        'Clarify estimate policy and exclusions for concealed damage.',
      ],
      CLEANING: [
        'Capture one-time deep clean vs recurring cadence and what is included in each.',
        'Clarify add-ons (inside fridge, oven, windows, post-construction).',
      ],
      POOL_SERVICE: [
        'Capture weekly/biweekly plans, chemical balancing scope, and opening/closing services.',
      ],
      TREE_SERVICE: [
        'Capture hazard assessments, permit constraints, debris haul-away, and stump grinding options.',
      ],
      OTHER: [
        'Identify natural service bundles, recurring options, and project-based options for this business.',
      ],
    };
    return hints[key] || hints.OTHER;
  }

  private sanitizeAssistantMessages(messages: KnowledgeAssistantMessage[]): KnowledgeAssistantMessage[] {
    if (!Array.isArray(messages)) return [];
    return messages
      .map((message) => {
        const role: AssistantRole = message?.role === 'assistant' ? 'assistant' : 'user';
        return {
          role,
          content: String(message?.content || '').trim().slice(0, 4000),
        };
      })
      .filter((message) => Boolean(message.content))
      .slice(-24);
  }

  private async callJsonModel(systemPrompt: string, payload: Record<string, any>): Promise<any> {
    const configuredModel = String(this.knowledgeAssistantModelId || '').trim();
    const modelCandidates = Array.from(
      new Set([configuredModel, 'gpt-4.1-nano', 'gpt-4o-mini', 'gpt-4.1-mini'].filter(Boolean)),
    );
    const serializedPayload = JSON.stringify(payload);
    let lastError: any = null;

    for (const model of modelCandidates) {
      try {
        const response = await this.openai.chat.completions.create({
          model: model as any,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: serializedPayload },
          ],
        } as any);
        const text = response.choices?.[0]?.message?.content || '{}';
        return this.parseJsonObject(text);
      } catch (error: any) {
        lastError = error;
        console.warn(`[KnowledgeService] Model ${model} failed for assistant call.`, error?.message || error);
      }
    }

    throw new Error(
      `Knowledge setup assistant request failed: ${
        (lastError as any)?.message || 'No model succeeded'
      }`,
    );
  }

  private parseJsonObject(text: string): any {
    if (!text) return {};
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const cleaned = trimmed
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();
      return JSON.parse(cleaned);
    }
  }

  private parseAssistantReply(raw: any, fallback: KnowledgeAssistantReply): KnowledgeAssistantReply {
    const missingTopics = Array.isArray(raw?.missing_topics)
      ? raw.missing_topics.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 12)
      : fallback.missing_topics;
    const gatheredTopics = Array.isArray(raw?.gathered_topics)
      ? raw.gathered_topics.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 20)
      : [];

    return {
      assistant_message: String(raw?.assistant_message || fallback.assistant_message).trim().slice(0, 1200),
      done: raw?.done === true,
      missing_topics: missingTopics,
      gathered_topics: gatheredTopics,
    };
  }

  private parseGeneratedItems(raw: any): GeneratedKnowledgeDraft[] {
    const allowedTypes = new Set<KnowledgeType>(['FAQ', 'SERVICE', 'POLICY', 'PRODUCT', 'SAFETY']);
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const normalized: GeneratedKnowledgeDraft[] = [];
    const seenTitles = new Set<string>();

    for (const item of items) {
      const title = String(item?.title || '').trim().slice(0, 180);
      const content = String(item?.content || '').trim().slice(0, 6000);
      const typeCandidate = String(item?.type || 'FAQ').toUpperCase() as KnowledgeType;
      const type: KnowledgeType = allowedTypes.has(typeCandidate) ? typeCandidate : 'FAQ';
      const titleKey = title.toLowerCase();
      if (!title || !content || seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      const tags = Array.isArray(item?.tags)
        ? item.tags
            .map((tag: any) => String(tag || '').toLowerCase().trim())
            .filter(Boolean)
            .map((tag: string) => tag.replace(/[^a-z0-9:_-]/g, '').slice(0, 32))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      normalized.push({
        title,
        content,
        type,
        tags,
      });
    }

    return normalized.slice(0, 24);
  }

  /**
   * Extract pricing/service data from the setup conversation and auto-create service products.
   */
  async extractAndCreateProducts(
    companyId: string,
    messages: KnowledgeAssistantMessage[],
  ): Promise<{ created_count: number; skipped_count: number }> {
    const cleanMessages = this.sanitizeAssistantMessages(messages);
    const companyContext = await this.buildAssistantCompanyContext(companyId);

    const systemPrompt = [
      'You extract structured service product definitions from a business setup conversation.',
      'Return ONLY products that have a clear price mentioned (numeric value, range, or "starting at").',
      'For price ranges, use the midpoint or lowest value in cents.',
      'Each product needs: name, description (1-2 sentences), price_type (ONE_TIME or SUBSCRIPTION), amount_cents (integer, min 50), billing_interval (month/year, only if SUBSCRIPTION).',
      'Generate between 0 and 8 products. If no pricing is discussed, return an empty array.',
      'Return strict JSON: {"products":[{"name":"string","description":"string","price_type":"ONE_TIME|SUBSCRIPTION","amount_cents":integer,"billing_interval":"month|year|null"}]}',
      'Never include markdown code fences.',
    ].join('\n');

    const payload = {
      company_context: companyContext,
      conversation: cleanMessages,
    };

    let raw: any;
    try {
      raw = await this.callJsonModel(systemPrompt, payload);
    } catch {
      return { created_count: 0, skipped_count: 0 };
    }

    const products: any[] = Array.isArray(raw?.products) ? raw.products : [];
    let created_count = 0;
    let skipped_count = 0;

    // Fetch existing products to avoid duplicates
    const existing = await this.serviceProductsService.list(companyId, { includeInactive: true });
    const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));

    for (const p of products) {
      const name = String(p?.name || '').trim();
      const amountCents = typeof p?.amount_cents === 'number' ? Math.round(p.amount_cents) : 0;
      const priceType: 'ONE_TIME' | 'SUBSCRIPTION' =
        p?.price_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME';
      const billingInterval = priceType === 'SUBSCRIPTION' ? (p?.billing_interval || 'month') : undefined;

      if (!name || amountCents < 50) { skipped_count++; continue; }
      if (existingNames.has(name.toLowerCase())) { skipped_count++; continue; }

      try {
        await this.serviceProductsService.create(companyId, {
          name,
          description: String(p?.description || '').trim() || undefined,
          price_type: priceType,
          amount_cents: amountCents,
          currency: 'usd',
          ...(billingInterval ? { billing_interval: billingInterval as any } : {}),
        });
        existingNames.add(name.toLowerCase());
        created_count++;
      } catch {
        skipped_count++;
      }
    }

    return { created_count, skipped_count };
  }

  /**
   * Bulk import knowledge items from JSON array
   */
  async bulkImport(
    companyId: string,
    items: CreateKnowledgeDto[],
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const item of items) {
      try {
        await this.createKnowledgeItem(companyId, item);
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${item.title}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Search knowledge using semantic search (queries RAG service)
   */
  async searchKnowledge(
    companyId: string,
    query: string,
    topK: number = 5,
  ): Promise<Array<{ item: KnowledgeItem; text: string; similarity: number }>> {
    try {
      // Get relevant chunks using RAG
      const chunks = await this.ragService.retrieveRelevantKnowledge(
        companyId,
        query,
        topK,
      );

      // Get full knowledge items for the chunks
      const knowledgeIds = [...new Set(chunks.map((c) => c.knowledge_id))];
      const items: Array<{ item: KnowledgeItem; text: string; similarity: number }> = [];

      for (const knowledgeId of knowledgeIds) {
        const item = await this.getKnowledgeItem(companyId, knowledgeId);
        if (item) {
          const chunk = chunks.find((c) => c.knowledge_id === knowledgeId);
          items.push({
            item,
            text: chunk?.text || '',
            similarity: chunk?.similarity || 0,
          });
        }
      }

      return items.sort((a, b) => b.similarity - a.similarity);
    } catch (error: any) {
      // Fallback: simple keyword search over knowledge items (no embeddings required).
      console.warn('[KnowledgeService] Semantic search failed; falling back to keyword search.', error);

      const q = (query || '').trim().toLowerCase();
      const tokens = Array.from(
        new Set(
          q
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .filter((t) => t.length >= 3)
            .filter(
              (t) =>
                !new Set([
                  'what',
                  'which',
                  'kind',
                  'type',
                  'tell',
                  'about',
                  'use',
                  'uses',
                  'using',
                  'your',
                  'you',
                  'do',
                  'does',
                  'the',
                  'and',
                  'for',
                  'with',
                  'can',
                  'could',
                  'would',
                  'how',
                  'when',
                  'where',
                  'are',
                  'is',
                ]).has(t)
            )
        )
      );
      const all = await this.listKnowledgeItems(companyId, { limit: 500 });
      const matches = all
        .map((item) => {
          const hay = `${item.title}\n${item.content}\n${(item.tags || []).join(' ')}`.toLowerCase();
          let score = 0;
          if (q && hay.includes(q)) score += 2;
          if (tokens.length) {
            const titleHay = (item.title || '').toLowerCase();
            for (const tok of tokens) {
              if (hay.includes(tok)) score += 1;
              if (titleHay.includes(tok)) score += 1;
            }
          }
          return { item, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, topK));

      return matches.map((m) => ({
        item: m.item,
        text: m.item.content,
        similarity: m.score,
      }));
    }
  }
}

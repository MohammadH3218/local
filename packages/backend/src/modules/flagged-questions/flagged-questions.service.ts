import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { KnowledgeService, CreateKnowledgeDto } from '../knowledge/knowledge.service';
import { v4 as uuidv4 } from 'uuid';

export interface FlaggedQuestion {
  company_id: string;
  flagged_id: string;
  call_id: string;
  contact_id?: string;
  question: string;
  context?: string;
  ai_attempted_answer?: string;
  confidence_score?: number;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  resolved_at?: number;
  resolved_by?: string;
  knowledge_id?: string;
  answer?: string;
  created_at: number;
  updated_at: number;
}

export interface CreateFlaggedQuestionDto {
  call_id: string;
  contact_id?: string;
  question: string;
  context?: string;
  ai_attempted_answer?: string;
  confidence_score?: number;
}

export interface ResolveQuestionDto {
  answer: string;
  create_knowledge?: boolean;
  knowledge_type?: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
}

@Injectable()
export class FlaggedQuestionsService {
  private tableName: string;

  constructor(
    private dynamodb: DynamoDBService,
    private knowledgeService: KnowledgeService,
    private configService: ConfigService,
  ) {
    const tablePrefix = this.configService.get<string>('DYNAMODB_TABLE_PREFIX');
    this.tableName = `${tablePrefix}flagged_questions`;
  }

  /**
   * Create a flagged question (called by AI during call when confidence is low)
   */
  async createFlaggedQuestion(
    companyId: string,
    data: CreateFlaggedQuestionDto,
  ): Promise<FlaggedQuestion> {
    try {
      const flaggedId = uuidv4();
      const now = Date.now();

      const flaggedQuestion: FlaggedQuestion = {
        company_id: companyId,
        flagged_id: flaggedId,
        call_id: data.call_id,
        contact_id: data.contact_id,
        question: data.question,
        context: data.context,
        ai_attempted_answer: data.ai_attempted_answer,
        confidence_score: data.confidence_score,
        status: 'OPEN',
        created_at: now,
        updated_at: now,
      };

      // Store in DynamoDB with GSI sort key for status filtering
      await this.dynamodb.put(this.tableName, {
        ...flaggedQuestion,
        status_created: `${flaggedQuestion.status}#${now}`,
      });

      return flaggedQuestion;
    } catch (error: any) {
      console.error('Error creating flagged question:', error);
      throw new Error(`Failed to create flagged question: ${error.message}`);
    }
  }

  /**
   * Resolve a flagged question by providing an answer
   * Optionally creates a knowledge item for future reference
   */
  async resolveFlaggedQuestion(
    companyId: string,
    flaggedId: string,
    userId: string,
    data: ResolveQuestionDto,
  ): Promise<FlaggedQuestion> {
    try {
      // Get existing flagged question
      const existing = await this.getFlaggedQuestion(companyId, flaggedId);
      if (!existing) {
        throw new NotFoundException(`Flagged question ${flaggedId} not found`);
      }

      if (existing.status !== 'OPEN') {
        throw new Error('Question has already been resolved or dismissed');
      }

      const now = Date.now();
      let knowledgeId: string | undefined;

      // Create knowledge item if requested (default: true)
      if (data.create_knowledge !== false) {
        const knowledgeDto: CreateKnowledgeDto = {
          title: existing.question,
          content: data.answer,
          type: data.knowledge_type || 'FAQ',
          source: 'flagged_question',
          tags: ['flagged-question'],
        };

        const knowledgeItem = await this.knowledgeService.createKnowledgeItem(
          companyId,
          knowledgeDto,
        );
        knowledgeId = knowledgeItem.knowledge_id;
      }

      // Update flagged question status
      const updated: FlaggedQuestion = {
        ...existing,
        status: 'RESOLVED',
        resolved_at: now,
        resolved_by: userId,
        knowledge_id: knowledgeId,
        answer: data.answer,
        updated_at: now,
      };

      await this.dynamodb.update(
        this.tableName,
        { company_id: companyId, flagged_id: flaggedId },
        {
          status: 'RESOLVED',
          resolved_at: now,
          resolved_by: userId,
          knowledge_id: knowledgeId,
          answer: data.answer,
          updated_at: now,
          status_created: `RESOLVED#${now}`,
        },
      );

      return updated;
    } catch (error: any) {
      console.error('Error resolving flagged question:', error);
      throw new Error(`Failed to resolve flagged question: ${error.message}`);
    }
  }

  /**
   * Dismiss a flagged question without creating knowledge
   */
  async dismissFlaggedQuestion(
    companyId: string,
    flaggedId: string,
    userId: string,
  ): Promise<FlaggedQuestion> {
    try {
      const existing = await this.getFlaggedQuestion(companyId, flaggedId);
      if (!existing) {
        throw new NotFoundException(`Flagged question ${flaggedId} not found`);
      }

      const now = Date.now();

      await this.dynamodb.update(
        this.tableName,
        { company_id: companyId, flagged_id: flaggedId },
        {
          status: 'DISMISSED',
          resolved_at: now,
          resolved_by: userId,
          updated_at: now,
          status_created: `DISMISSED#${now}`,
        },
      );

      return {
        ...existing,
        status: 'DISMISSED',
        resolved_at: now,
        resolved_by: userId,
        updated_at: now,
      };
    } catch (error: any) {
      console.error('Error dismissing flagged question:', error);
      throw new Error(`Failed to dismiss flagged question: ${error.message}`);
    }
  }

  /**
   * Get a single flagged question
   */
  async getFlaggedQuestion(
    companyId: string,
    flaggedId: string,
  ): Promise<FlaggedQuestion | null> {
    try {
      const result = await this.dynamodb.get(this.tableName, {
        company_id: companyId,
        flagged_id: flaggedId,
      });

      return (result?.Item as FlaggedQuestion) || null;
    } catch (error: any) {
      console.error('Error getting flagged question:', error);
      throw new Error(`Failed to get flagged question: ${error.message}`);
    }
  }

  /**
   * List flagged questions for a company
   */
  async listFlaggedQuestions(
    companyId: string,
    filters?: {
      status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
      call_id?: string;
      limit?: number;
    },
  ): Promise<FlaggedQuestion[]> {
    try {
      let result;

      if (filters?.status) {
        // Query by status using GSI
        result = await this.dynamodb.query(
          this.tableName,
          'company_id = :company_id',
          {
            IndexName: 'status-index',
          },
          {
            ':company_id': companyId,
          },
        );
      } else {
        // Query all for company
        result = await this.dynamodb.query(
          this.tableName,
          'company_id = :company_id',
          {},
          {
            ':company_id': companyId,
          },
        );
      }

      let items = (result.items || []) as FlaggedQuestion[];

      // Apply filters
      if (filters?.status) {
        items = items.filter((item) => item.status === filters.status);
      }
      if (filters?.call_id) {
        items = items.filter((item) => item.call_id === filters.call_id);
      }
      if (filters?.limit) {
        items = items.slice(0, filters.limit);
      }

      // Sort by created_at descending (newest first)
      items.sort((a, b) => b.created_at - a.created_at);

      return items;
    } catch (error: any) {
      console.error('Error listing flagged questions:', error);
      throw new Error(`Failed to list flagged questions: ${error.message}`);
    }
  }

  /**
   * Get count of open flagged questions (for dashboard)
   */
  async getOpenQuestionsCount(companyId: string): Promise<number> {
    try {
      const openQuestions = await this.listFlaggedQuestions(companyId, {
        status: 'OPEN',
      });
      return openQuestions.length;
    } catch (error: any) {
      console.error('Error getting open questions count:', error);
      throw new Error(`Failed to get open questions count: ${error.message}`);
    }
  }

  /**
   * Get flagged questions for a specific call
   */
  async getFlaggedQuestionsForCall(
    companyId: string,
    callId: string,
  ): Promise<FlaggedQuestion[]> {
    try {
      return await this.listFlaggedQuestions(companyId, { call_id: callId });
    } catch (error: any) {
      console.error('Error getting flagged questions for call:', error);
      throw new Error(`Failed to get flagged questions for call: ${error.message}`);
    }
  }

  /**
   * Bulk resolve multiple flagged questions with the same answer
   */
  async bulkResolve(
    companyId: string,
    flaggedIds: string[],
    userId: string,
    data: ResolveQuestionDto,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const flaggedId of flaggedIds) {
      try {
        await this.resolveFlaggedQuestion(companyId, flaggedId, userId, data);
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${flaggedId}: ${error.message}`);
      }
    }

    return results;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

@Injectable()
export class RagService {
  private openai: OpenAI;
  private embeddingModelId: string;

  constructor(
    private configService: ConfigService,
    private dynamodb: DynamoDBService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not found in config, RAG embedding generation will fail.');
    }
    this.openai = new OpenAI({ apiKey: apiKey || 'dummy' });
    this.embeddingModelId = this.configService.get<string>('OPENAI_EMBEDDING_MODEL_ID') || 'text-embedding-3-small';
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModelId,
        input: text,
      });
      return response.data[0].embedding;
    } catch (error: any) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${(error as any)?.message || String(error)}`);
    }
  }

  /**
   * Split text into chunks, generate embeddings, and store in DynamoDB
   */
  async chunkAndStoreKnowledge(
    companyId: string,
    knowledgeId: string,
    text: string,
  ): Promise<void> {
    try {
      // Split text into chunks (500 chars with 50 char overlap)
      const chunks = this.splitTextIntoChunks(text, 500, 50);

      const tablePrefix = this.configService.get<string>('DYNAMODB_TABLE_PREFIX');
      const tableName = `${tablePrefix}knowledge_chunks`;

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.generateEmbedding(chunks[i]);

        await this.dynamodb.put(tableName, {
          company_knowledge: `${companyId}#${knowledgeId}`,
          chunk_index: i,
          company_id: companyId,
          chunk_id: `${knowledgeId}_chunk_${i}`,
          knowledge_id: knowledgeId,
          text: chunks[i],
          embedding: embedding,
          created_at: Date.now(),
        });
      }
    } catch (error: any) {
      console.error('Error chunking and storing knowledge:', error);
      throw new Error(`Failed to chunk and store knowledge: ${(error as any)?.message || String(error)}`);
    }
  }

  /**
   * Retrieve relevant knowledge chunks using semantic search
   */
  async retrieveRelevantKnowledge(
    companyId: string,
    query: string,
    topK: number = 5,
  ): Promise<Array<{ text: string; similarity: number; knowledge_id: string }>> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      const tablePrefix = this.configService.get<string>('DYNAMODB_TABLE_PREFIX');
      const tableName = `${tablePrefix}knowledge_chunks`;

      // Get all chunks for company (in production, use vector DB for efficiency)
      const result = await this.dynamodb.scan(tableName, {
        filterExpression: 'company_id = :company_id',
        expressionAttributeValues: {
          ':company_id': companyId,
        },
      });

      if (!result.items || result.items.length === 0) {
        return [];
      }

      // Calculate similarities
      const rankedChunks = result.items.map((chunk: any) => ({
        text: chunk.text,
        knowledge_id: chunk.knowledge_id,
        similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, topK);

      return rankedChunks;
    } catch (error: any) {
      console.error('Error retrieving relevant knowledge:', error);
      throw new Error(`Failed to retrieve relevant knowledge: ${error?.message || String(error)}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Split text into chunks with overlap for better context
   */
  private splitTextIntoChunks(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Delete all chunks for a knowledge item
   */
  async deleteKnowledgeChunks(
    companyId: string,
    knowledgeId: string,
  ): Promise<void> {
    try {
      const tablePrefix = this.configService.get<string>('DYNAMODB_TABLE_PREFIX');
      const tableName = `${tablePrefix}knowledge_chunks`;

      // Query all chunks for this knowledge item
      const result = await this.dynamodb.query(
        tableName,
        'company_knowledge = :pk',
        {},
        {
          ':pk': `${companyId}#${knowledgeId}`,
        },
      );

      // Delete each chunk
      const items = Array.isArray(result) ? result : (result as any).items || [];
      if (items.length > 0) {
        for (const chunk of items) {
          await this.dynamodb.delete(tableName, {
            company_knowledge: chunk.company_knowledge,
            chunk_index: chunk.chunk_index,
          });
        }
      }
    } catch (error: any) {
      console.error('Error deleting knowledge chunks:', error);
      throw new Error(`Failed to delete knowledge chunks: ${error?.message || String(error)}`);
    }
  }
}

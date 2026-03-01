/**
 * RAG (Retrieval-Augmented Generation) types
 * Knowledge retrieval and AI response generation
 */

import type { UUID, Timestamp } from './domain';

// ============================================================================
// RAG Request/Response
// ============================================================================

export interface RAGQuery {
  company_id: UUID;
  query_text: string;
  context?: ConversationContext;
  max_results?: number;
  confidence_threshold?: number;
}

export interface RAGResponse {
  results: RetrievedKnowledge[];
  has_confident_answer: boolean;
  suggested_response?: string;
  confidence_score: number; // 0-1
  should_flag?: boolean;
  flag_reason?: string;
}

export interface RetrievedKnowledge {
  knowledge_id: UUID;
  question: string;
  answer: string;
  relevance_score: number; // 0-1
  knowledge_type: string;
}

export interface ConversationContext {
  previous_messages: ConversationMessage[];
  caller_intent?: string;
  extracted_entities?: Record<string, unknown>;
}

export interface ConversationMessage {
  speaker: 'ai' | 'caller';
  text: string;
  timestamp: Timestamp;
}

// ============================================================================
// Embedding
// ============================================================================

export interface EmbeddingRequest {
  text: string;
  model?: string; // e.g., "amazon.titan-embed-text-v1"
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  token_count?: number;
}

// ============================================================================
// Vector Search
// ============================================================================

export interface VectorSearchQuery {
  company_id: UUID;
  query_embedding: number[];
  top_k?: number;
  similarity_threshold?: number;
}

export interface VectorSearchResult {
  chunk_id: UUID;
  knowledge_id: UUID;
  chunk_text: string;
  similarity_score: number;
}

// ============================================================================
// AI Agent Execution
// ============================================================================

export interface AgentExecutionRequest {
  company_id: UUID;
  caller_input: string;
  conversation_history: ConversationMessage[];
  agent_config: {
    tone: string;
    custom_greeting?: string;
    can_discuss_pricing: boolean;
    booking_mode: string;
  };
}

export interface AgentExecutionResponse {
  response_text: string;
  intent_detected?: string;
  entities_extracted?: Record<string, unknown>;
  confidence: number;
  actions_taken?: AgentAction[];
  should_escalate: boolean;
  escalation_reason?: string;
}

export interface AgentAction {
  type: 'LEAD_CAPTURED' | 'APPOINTMENT_PROPOSED' | 'KNOWLEDGE_RETRIEVED' | 'QUESTION_FLAGGED';
  data: Record<string, unknown>;
  timestamp: Timestamp;
}

// ============================================================================
// Knowledge Processing
// ============================================================================

export interface ChunkingRequest {
  text: string;
  chunk_size?: number; // Characters per chunk
  overlap?: number; // Overlap between chunks
}

export interface ChunkingResponse {
  chunks: TextChunk[];
}

export interface TextChunk {
  text: string;
  index: number;
  start_char: number;
  end_char: number;
}

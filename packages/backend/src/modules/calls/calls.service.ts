import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import { UsageService } from '../billing/usage.service';
import { UsageGateService } from '../billing/usage-gate.service';
import { SubscriptionPlan } from '@handycall/shared';

export interface Call {
  call_id: string;
  company_id: string;
  contact_id?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  caller_phone: string;
  caller_name?: string;
  created_at: string;
  duration?: number;
  status: string;
  summary?: string;
  transcript?: string;
  recording_url?: string;
  sentiment?: string;
  tags?: string[];
  lead_captured?: boolean;
  appointment_created?: boolean;
  appointment_id?: string;
  outcome?: string;
  lead_quality?: string;
  collected_info?: any;
}

@Injectable()
export class CallsService {
  constructor(
    private dynamodb: DynamoDBService,
    private s3Service: S3Service,
    private usageService: UsageService,
    private usageGate: UsageGateService,
  ) {}

  async getCalls(
    companyId: string,
    options?: {
      limit?: number;
      lastEvaluatedKey?: any;
    }
  ): Promise<{ calls: Call[]; lastEvaluatedKey?: any }> {
    const result = await this.dynamodb.queryByCompany(
      'calls',
      companyId,
      {},
      {
        // Production table uses `date-index` (company_id + started_at) for recency ordering.
        indexName: 'date-index',
        limit: options?.limit || 50,
        scanIndexForward: false, // Most recent first
        exclusiveStartKey: options?.lastEvaluatedKey,
      }
    );

    return {
      calls: (result.items || []).map((item: any) => this.toUiCall(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  async getCallsCount(companyId: string): Promise<number> {
    let total = 0;
    let lastKey: Record<string, any> | undefined;
    do {
      const result = await this.dynamodb.queryByCompany(
        'calls',
        companyId,
        {},
        {
          indexName: 'date-index',
          select: 'COUNT',
          exclusiveStartKey: lastKey,
        }
      );
      total += result.count || 0;
      lastKey = result.lastEvaluatedKey as any;
    } while (lastKey);
    return total;
  }

  async getCallById(companyId: string, callId: string): Promise<Call> {
    const raw = await this.dynamodb.get('calls', {
      company_id: companyId,
      call_id: callId,
    });

    if (!raw) {
      throw new NotFoundException('Call not found');
    }

    const call: any = this.toUiCall(raw);

    // Generate presigned URL for recording if it exists
    try {
      const recordingExists = await this.s3Service.recordingExists(companyId, callId);
      if (recordingExists) {
        call.recording_url = await this.s3Service.getRecordingUrl(companyId, callId);
      }
    } catch {
      // Recording storage is optional in MVP; don't fail call detail if S3 permissions/policy are missing.
    }

    // Get transcript if available
    try {
      const transcript = await this.s3Service.getTranscript(companyId, callId);
      if (transcript) {
        call.transcript =
          typeof transcript === 'string'
            ? transcript
            : typeof transcript?.text === 'string'
              ? transcript.text
              : typeof transcript?.full_text === 'string'
                ? transcript.full_text
              : JSON.stringify(transcript, null, 2);
      }
    } catch (error) {
      // Transcript doesn't exist, that's okay
    }

    return call as Call;
  }

  async getRecordingUrl(companyId: string, callId: string): Promise<string> {
    // Verify call belongs to company
    const call = await this.dynamodb.get('calls', {
      company_id: companyId,
      call_id: callId,
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const recordingExists = await this.s3Service.recordingExists(companyId, callId);
    if (!recordingExists) {
      throw new NotFoundException('Recording not found');
    }

    return this.s3Service.getRecordingUrl(companyId, callId);
  }

  async searchCalls(
    companyId: string,
    query: string,
    options?: {
      limit?: number;
    }
  ): Promise<Call[]> {
    // For now, do a simple scan with filter
    // In production, you'd want to use ElasticSearch or similar
    const result = await this.dynamodb.queryByCompany(
      'calls',
      companyId,
      {},
      {
        indexName: 'date-index',
        limit: options?.limit || 50,
        scanIndexForward: false,
      }
    );

    // Filter results based on query
    const filtered = result.items.filter((call: any) => {
      const searchableText = [
        call.from_number,
        call.to_number,
        call.caller_phone,
        call.caller_name,
        call.summary,
      ].join(' ').toLowerCase();
      return searchableText.includes(query.toLowerCase());
    });

    return filtered.map((item: any) => this.toUiCall(item));
  }

  private toUiCall(item: any): Call {
    const startedAt =
      typeof item?.started_at === 'number'
        ? item.started_at
        : typeof item?.created_at === 'number'
          ? item.created_at
          : undefined;

    const createdAtIso = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();

    return {
      call_id: item.call_id,
      company_id: item.company_id,
      contact_id: item.contact_id,
      from_number: item.from_number,
      to_number: item.to_number,
      direction: item.direction,
      caller_phone: item.from_number || item.caller_phone || 'Unknown',
      caller_name: item.caller_name,
      created_at: item.created_at ? new Date(item.created_at).toISOString() : createdAtIso,
      duration: item.duration_seconds ?? item.duration,
      status: item.status,
      summary: item.summary,
      sentiment: item.sentiment,
      tags: item.tags,
      transcript: item.transcript,
      recording_url: item.recording_url,
      lead_captured: item.lead_captured,
      appointment_created: item.appointment_created,
      appointment_id: item.appointment_id,
      outcome: item.outcome,
      lead_quality: item.lead_quality,
      collected_info: item.collected_info,
    };
  }

  /**
   * Record usage for a completed call. Intended to be invoked by the telephony
   * pipeline once a call duration is known (to avoid double-counting on reads).
   */
  async recordCallUsage(companyId: string, durationSeconds?: number, plan?: SubscriptionPlan) {
    if (!durationSeconds || durationSeconds <= 0) {
      return;
    }
    const minutes = Number((durationSeconds / 60).toFixed(2));
    await this.usageService.incrementCallMinutes(companyId, minutes);
    await this.usageGate.enforceUsagePolicy(companyId);

    // Optional: callers can provide plan to check limits; if omitted we only persist usage
    if (plan) {
      const periodStart = Date.now(); // placeholder; caller should pass actual billing period if available
      await this.usageService.checkLimitsExceeded(companyId, plan, periodStart);
    }
  }
}

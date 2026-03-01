import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { AgentConfig, GreetingTone, BookingMode } from '@handycall/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AgentConfigService {
  private readonly tableName = 'agent_configs';

  constructor(private dynamodb: DynamoDBService) {}

  async createDefaultConfig(companyId: string): Promise<AgentConfig> {
    const configId = uuidv4();
    const timestamp = Date.now();

    const config: AgentConfig = {
      config_id: configId,
      company_id: companyId,
      greeting_tone: GreetingTone.PROFESSIONAL,
      booking_mode: BookingMode.PROPOSE_TIMES,
      can_discuss_pricing: true,
      can_handle_emergencies: false,
      escalation_threshold: 0.7,
      require_callback_confirmation: true,
      send_sms_summary: true,
      realtime_model: 'gpt-realtime',
      realtime_voice: 'marin',
      created_at: timestamp,
      updated_at: timestamp,
    };

    await this.dynamodb.put(this.tableName, config);

    return config;
  }

  async getConfig(companyId: string): Promise<AgentConfig | null> {
    const config = await this.dynamodb.get(this.tableName, { company_id: companyId });
    return config as AgentConfig | null;
  }

  async updateConfig(
    companyId: string,
    updates: {
      greeting_tone?: GreetingTone;
      custom_greeting?: string;
      booking_mode?: BookingMode;
      can_discuss_pricing?: boolean;
      can_handle_emergencies?: boolean;
      escalation_threshold?: number;
      require_callback_confirmation?: boolean;
      send_sms_summary?: boolean;
    }
  ): Promise<AgentConfig> {
    const config = await this.getConfig(companyId);
    if (!config) {
      throw new NotFoundException('Agent config not found');
    }

    const updatedData = {
      ...updates,
      updated_at: Date.now(),
    };

    const result = await this.dynamodb.update(this.tableName, { company_id: companyId }, updatedData);

    return result as AgentConfig;
  }
}

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

@Injectable()
export class CustomerProfilesService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  async getOrCreate(userId: string, data?: { email?: string; name?: string; phone?: string }) {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;

    const now = Date.now();
    const profileId = uuidv4();
    const profile = {
      user_id: userId,
      profile_id: profileId,
      email: data?.email,
      name: data?.name,
      phone: data?.phone,
      created_at: now,
      updated_at: now,
    };

    await this.dynamodb.put('customer_profiles', profile);
    return profile;
  }

  async getByUserId(userId: string) {
    const result = await this.dynamodb.scan('customer_profiles', {
      filterExpression: '#user_id = :user_id',
      expressionAttributeNames: { '#user_id': 'user_id' },
      expressionAttributeValues: { ':user_id': userId },
      limit: 1,
    });
    return result.items?.[0] || null;
  }

  async update(userId: string, updates: { name?: string; phone?: string; default_location?: string; notification_prefs?: any }) {
    const profile = await this.getByUserId(userId);
    if (!profile) return this.getOrCreate(userId, updates);

    const validUpdates: Record<string, any> = { updated_at: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) validUpdates[key] = value;
    }

    await this.dynamodb.update(
      'customer_profiles',
      { user_id: userId, profile_id: (profile as any).profile_id },
      validUpdates,
    );

    return this.getByUserId(userId);
  }
}

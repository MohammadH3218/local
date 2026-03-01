import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

export interface LeadScoringFactors {
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  callCount: number;
  appointmentCount: number;
  recentActivity: boolean;
  leadStatus: string;
}

@Injectable()
export class LeadScoringService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  calculateScore(factors: LeadScoringFactors): number {
    let score = 0;

    // Contact completeness (max 20 pts)
    if (factors.hasPhone) score += 10;
    if (factors.hasEmail) score += 5;
    if (factors.hasAddress) score += 5;

    // Engagement (max 40 pts)
    score += Math.min(20, factors.callCount * 5);
    score += Math.min(20, factors.appointmentCount * 10);

    // Recency (max 20 pts)
    if (factors.recentActivity) score += 20;

    // Status (max 20 pts)
    const statusScores: Record<string, number> = {
      HOT: 20,
      WARM: 15,
      QUOTED: 10,
      FOLLOW_UP: 5,
      COLD: 0,
      LOST: 0,
    };
    score += statusScores[factors.leadStatus?.toUpperCase()] || 0;

    return Math.min(100, score);
  }

  getScoreLabel(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  }

  async scoreContact(companyId: string, contactId: string): Promise<{
    score: number;
    label: 'hot' | 'warm' | 'cold';
    factors: LeadScoringFactors;
  }> {
    const contact = await this.dynamodb.get('contacts', { company_id: companyId, contact_id: contactId }) as any;
    if (!contact) return { score: 0, label: 'cold', factors: {} as any };

    // Count calls
    const callsResult = await this.dynamodb.scan('calls', {
      filterExpression: '#company_id = :cid AND #contact_id = :contact_id',
      expressionAttributeNames: { '#company_id': 'company_id', '#contact_id': 'contact_id' },
      expressionAttributeValues: { ':cid': companyId, ':contact_id': contactId },
      limit: 20,
    });

    // Count appointments
    const apptResult = await this.dynamodb.scan('appointments', {
      filterExpression: '#company_id = :cid AND #contact_id = :contact_id',
      expressionAttributeNames: { '#company_id': 'company_id', '#contact_id': 'contact_id' },
      expressionAttributeValues: { ':cid': companyId, ':contact_id': contactId },
      limit: 20,
    });

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentActivity = (contact.last_contact_at || contact.updated_at || 0) > thirtyDaysAgo;

    const factors: LeadScoringFactors = {
      hasEmail: Boolean(contact.email),
      hasPhone: Boolean(contact.phone_number || contact.phone),
      hasAddress: Boolean(contact.address),
      callCount: callsResult.items?.length || 0,
      appointmentCount: apptResult.items?.length || 0,
      recentActivity,
      leadStatus: contact.lead_status || 'UNKNOWN',
    };

    const score = this.calculateScore(factors);
    const label = this.getScoreLabel(score);

    return { score, label, factors };
  }

  async scoreAllContacts(companyId: string): Promise<Array<{ contact_id: string; score: number; label: string }>> {
    const result = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: { '#company_id': 'company_id' },
      expressionAttributeValues: { ':company_id': companyId },
      limit: 500,
    });

    const scores = await Promise.all(
      (result.items || []).map(async (c: any) => {
        const scored = await this.scoreContact(companyId, c.contact_id);
        return { contact_id: c.contact_id, ...scored };
      }),
    );

    return scores.sort((a, b) => b.score - a.score);
  }
}

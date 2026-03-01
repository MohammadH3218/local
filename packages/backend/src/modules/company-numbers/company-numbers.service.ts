import { BadRequestException, Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

export interface CompanyNumber {
  did_e164: string;
  company_id: string;
  provider?: 'CONNECT' | 'TWILIO' | 'OTHER';
  label?: string;
  created_at: number;
  updated_at: number;
}

@Injectable()
export class CompanyNumbersService {
  private readonly tableName = 'company_numbers';

  constructor(private readonly dynamodb: DynamoDBService) {}

  async resolveCompanyIdByDid(didE164: string): Promise<string | null> {
    const item = await this.dynamodb.get(this.tableName, { did_e164: didE164 });
    return (item?.company_id as string | undefined) ?? null;
  }

  async listCompanyNumbers(companyId: string): Promise<CompanyNumber[]> {
    const result = await this.dynamodb.query(
      this.tableName,
      '#company_id = :company_id',
      { '#company_id': 'company_id' },
      { ':company_id': companyId },
      { indexName: 'company-index' }
    );
    return result.items as CompanyNumber[];
  }

  async assignDidToCompany(input: {
    did_e164: string;
    company_id: string;
    provider?: CompanyNumber['provider'];
    label?: string;
  }): Promise<CompanyNumber> {
    if (!input.did_e164?.startsWith('+')) {
      throw new BadRequestException('did_e164 must be E.164 (e.g., +15551234567)');
    }

    const existing = await this.dynamodb.get(this.tableName, { did_e164: input.did_e164 });
    if (existing && existing.company_id && existing.company_id !== input.company_id) {
      throw new BadRequestException('DID is already assigned to another company');
    }

    const timestamp = Date.now();
    const next: CompanyNumber = {
      did_e164: input.did_e164,
      company_id: input.company_id,
      provider: input.provider,
      label: input.label,
      created_at: (existing?.created_at as number | undefined) ?? timestamp,
      updated_at: timestamp,
    };

    await this.dynamodb.put(this.tableName, next);
    return next;
  }

  async unassignDid(input: { did_e164: string; company_id: string }): Promise<void> {
    const existing = await this.dynamodb.get(this.tableName, { did_e164: input.did_e164 });
    if (!existing) return;
    if (existing.company_id !== input.company_id) {
      throw new BadRequestException('DID does not belong to this company');
    }
    await this.dynamodb.delete(this.tableName, { did_e164: input.did_e164 });
  }
}


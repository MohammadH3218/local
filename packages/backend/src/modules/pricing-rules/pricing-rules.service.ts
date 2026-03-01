import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

@Injectable()
export class PricingRulesService {
  constructor(private dynamodb: DynamoDBService) {}
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamoDBService implements OnModuleInit {
  private client!: DynamoDBClient;
  private docClient!: DynamoDBDocumentClient;
  private tablePrefix!: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const region = this.configService.get<string>('AWS_REGION');
    const endpoint = this.configService.get<string>('DYNAMODB_ENDPOINT');

    this.client = new DynamoDBClient({
      region,
      ...(endpoint && { endpoint }), // For local development
    });

    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    this.tablePrefix = this.configService.get<string>('DYNAMODB_TABLE_PREFIX') || '';
  }

  getTableName(baseName: string): string {
    return `${this.tablePrefix}${baseName}`;
  }

  async get(tableName: string, key: Record<string, any>) {
    const command = new GetCommand({
      TableName: this.getTableName(tableName),
      Key: key,
    });
    const result = await this.docClient.send(command);
    return result.Item;
  }

  async put(tableName: string, item: Record<string, any>) {
    const command = new PutCommand({
      TableName: this.getTableName(tableName),
      Item: item,
    });
    await this.docClient.send(command);
    return item;
  }

  async update(
    tableName: string,
    key: Record<string, any>,
    updates: Record<string, any>
  ) {
    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updates).forEach(([field, value], index) => {
      const nameAlias = `#field${index}`;
      const valueAlias = `:value${index}`;

      updateExpressionParts.push(`${nameAlias} = ${valueAlias}`);
      expressionAttributeNames[nameAlias] = field;
      expressionAttributeValues[valueAlias] = value;
    });

    const command = new UpdateCommand({
      TableName: this.getTableName(tableName),
      Key: key,
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await this.docClient.send(command);
    return result.Attributes;
  }

  async delete(tableName: string, key: Record<string, any>) {
    const command = new DeleteCommand({
      TableName: this.getTableName(tableName),
      Key: key,
    });
    await this.docClient.send(command);
  }

  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    options?: {
      indexName?: string;
      limit?: number;
      scanIndexForward?: boolean;
      exclusiveStartKey?: Record<string, any>;
      filterExpression?: string;
      select?: 'COUNT' | 'ALL_ATTRIBUTES';
    }
  ) {
    // Convert camelCase options to the AWS SDK v3 expected names.
    const command = new QueryCommand({
      TableName: this.getTableName(tableName),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(options?.indexName && { IndexName: options.indexName }),
      ...(typeof options?.limit === 'number' && { Limit: options.limit }),
      ...(typeof options?.scanIndexForward === 'boolean' && {
        ScanIndexForward: options.scanIndexForward,
      }),
      ...(options?.exclusiveStartKey && { ExclusiveStartKey: options.exclusiveStartKey }),
      ...(options?.filterExpression && { FilterExpression: options.filterExpression }),
      ...(options?.select && { Select: options.select }),
    });

    const result = await this.docClient.send(command);
    return {
      items: result.Items || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  async scan(
    tableName: string,
    options?: {
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      expressionAttributeValues?: Record<string, any>;
      limit?: number;
      exclusiveStartKey?: Record<string, any>;
      select?: 'COUNT' | 'ALL_ATTRIBUTES';
    }
  ) {
    // Convert camelCase to PascalCase for AWS SDK v3
    const command = new ScanCommand({
      TableName: this.getTableName(tableName),
      ...(options?.filterExpression && { FilterExpression: options.filterExpression }),
      ...(options?.expressionAttributeNames && { ExpressionAttributeNames: options.expressionAttributeNames }),
      ...(options?.expressionAttributeValues && { ExpressionAttributeValues: options.expressionAttributeValues }),
      ...(options?.limit && { Limit: options.limit }),
      ...(options?.exclusiveStartKey && { ExclusiveStartKey: options.exclusiveStartKey }),
      ...(options?.select && { Select: options.select }),
    });

    const result = await this.docClient.send(command);
    return {
      items: result.Items || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  /**
   * Company-scoped query - ensures all queries are filtered by company_id
   */
  async queryByCompany(
    tableName: string,
    companyId: string,
    additionalConditions?: {
      keyCondition?: string;
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      expressionAttributeValues?: Record<string, any>;
    },
    options?: {
      indexName?: string;
      limit?: number;
      scanIndexForward?: boolean;
      exclusiveStartKey?: Record<string, any>;
      select?: 'COUNT' | 'ALL_ATTRIBUTES';
    }
  ) {
    let keyConditionExpression = '#company_id = :company_id';
    const expressionAttributeNames: Record<string, string> = {
      '#company_id': 'company_id',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':company_id': companyId,
    };

    // Merge in caller-provided names/values to support secondary attributes
    if (additionalConditions?.expressionAttributeNames) {
      Object.assign(expressionAttributeNames, additionalConditions.expressionAttributeNames);
    }
    if (additionalConditions?.expressionAttributeValues) {
      Object.assign(expressionAttributeValues, additionalConditions.expressionAttributeValues);
    }

    if (additionalConditions?.keyCondition) {
      keyConditionExpression += ` AND ${additionalConditions.keyCondition}`;
    }

    return this.query(
      tableName,
      keyConditionExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      {
        ...options,
        filterExpression: additionalConditions?.filterExpression,
      }
    );
  }
}

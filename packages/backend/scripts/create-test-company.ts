#!/usr/bin/env ts-node
/**
 * Script to create a test company for development
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'handycall_dev_';

async function createTestCompany() {
  try {
    const companyId = randomUUID();
    const now = Date.now();

    const testCompany = {
      company_id: companyId,
      company_name: 'Test Company - AI Calling',
      email: 'test@example.com',
      phone_number: '+15555551234',
      status: 'ACTIVE',
      timezone: 'America/New_York',
      business_hours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: { open: '10:00', close: '14:00' },
        sunday: { open: 'closed', close: 'closed' },
      },
      calls_enabled: true,
      sms_enabled: false,
      subscription_tier: 'PREMIUM',
      subscription_status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    };

    console.log('\n🏢 Creating test company...');
    console.log(`   Name: ${testCompany.company_name}`);
    console.log(`   ID: ${testCompany.company_id}`);

    const putCommand = new PutCommand({
      TableName: `${TABLE_PREFIX}companies`,
      Item: testCompany,
    });

    await docClient.send(putCommand);

    console.log('\n✅ Test company created successfully!');
    console.log('\nCompany details:');
    console.log(`  Company ID: ${testCompany.company_id}`);
    console.log(`  Company Name: ${testCompany.company_name}`);
    console.log(`  Email: ${testCompany.email}`);
    console.log(`  Status: ${testCompany.status}`);
    console.log(`  Calls Enabled: ${testCompany.calls_enabled}`);

    console.log('\n📝 Next step: Associate phone number with this company');
    console.log(`   Run: npx ts-node scripts/associate-phone-number.ts ${testCompany.company_id}`);

    return testCompany;
  } catch (error) {
    console.error('❌ Error creating test company:', error);
    process.exit(1);
  }
}

createTestCompany();

/* eslint-disable no-console */
/**
 * Seed a default knowledge base for a company.
 *
 * Usage:
 *   COMPANY_EMAIL="hamdallahmohammad3219@gmail.com" node scripts/seed-company-knowledge.js
 *   COMPANY_ID="uuid" node scripts/seed-company-knowledge.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'handycall_prod_';
const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
const COMPANY_ID = process.env.COMPANY_ID;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

const PLUMBING_ITEMS = [
  {
    title: 'What plumbing services do you offer?',
    content:
      'We handle common residential plumbing needs including leaks, clogs, fixture installs, water heaters, garbage disposals, and shutoff valve replacements. If you are unsure, describe the issue and we will confirm the right service.',
    type: 'SERVICE',
    tags: ['services', 'residential', 'repairs'],
  },
  {
    title: 'Do you handle emergency plumbing?',
    content:
      'Yes. We offer limited emergency support for active leaks, no hot water, sewer backups, and burst pipes. After-hours availability depends on technician capacity.',
    type: 'FAQ',
    tags: ['emergency', 'after-hours'],
  },
  {
    title: 'What areas do you service?',
    content:
      'We serve the primary service area listed in your account settings. If you are outside the area, we may still be able to help depending on distance and schedule.',
    type: 'FAQ',
    tags: ['service area'],
  },
  {
    title: 'How do estimates work?',
    content:
      'We typically confirm the issue and provide an estimate after we gather a few details. Some jobs can be priced over the phone, while others require an onsite inspection.',
    type: 'PRICING_INFO',
    tags: ['pricing', 'estimate'],
  },
  {
    title: 'Do you charge a trip fee?',
    content:
      'For some calls we apply a diagnostic or trip fee that is credited toward the final service if you proceed. We will confirm any fee before scheduling.',
    type: 'PRICING_INFO',
    tags: ['trip fee', 'diagnostic'],
  },
  {
    title: 'What information do you need to schedule?',
    content:
      'We will ask for the service address, a contact name and phone number, the issue description, and any access notes (gate codes, parking, pets).',
    type: 'FAQ',
    tags: ['scheduling', 'booking'],
  },
  {
    title: 'What is your cancellation or reschedule policy?',
    content:
      'You can reschedule with advance notice. Same-day changes may be limited based on technician availability. We will do our best to accommodate.',
    type: 'POLICY',
    tags: ['reschedule', 'cancellation'],
  },
  {
    title: 'Do you install or replace water heaters?',
    content:
      'Yes. We install standard tank and tankless water heaters. We will confirm unit size, fuel type, and venting before scheduling.',
    type: 'SERVICE',
    tags: ['water heater', 'installation'],
  },
  {
    title: 'Do you work on gas lines?',
    content:
      'We can handle basic gas-line work where permitted, but some jobs require specialized licensing. We will confirm based on the request.',
    type: 'SERVICE',
    tags: ['gas', 'safety'],
  },
  {
    title: 'Do you offer warranties?',
    content:
      'Workmanship is typically covered for a limited period, and parts follow manufacturer warranties. Details are shared on the final invoice.',
    type: 'WARRANTY',
    tags: ['warranty'],
  },
  {
    title: 'How quickly can you arrive?',
    content:
      'Same-day appointments are sometimes available depending on demand. We will confirm the earliest available slot during booking.',
    type: 'FAQ',
    tags: ['availability', 'response time'],
  },
  {
    title: 'Safety and access notes for technicians',
    content:
      'Please let us know about pets, parking restrictions, gate codes, or any hazards. For leaks, shutting off the main valve before arrival can reduce damage.',
    type: 'SAFETY',
    tags: ['safety', 'access'],
  },
];

async function findCompanyByEmail(email) {
  const table = `${TABLE_PREFIX}companies`;
  const res = await ddb.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  );
  return res.Items && res.Items.length ? res.Items[0] : null;
}

async function listExistingTitles(companyId) {
  const table = `${TABLE_PREFIX}knowledge_items`;
  const res = await ddb.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: '#company_id = :company_id',
      ExpressionAttributeNames: { '#company_id': 'company_id' },
      ExpressionAttributeValues: { ':company_id': companyId },
      ProjectionExpression: 'title',
    })
  );
  const titles = new Set();
  for (const item of res.Items || []) {
    if (item?.title) titles.add(String(item.title).toLowerCase());
  }
  return titles;
}

async function seedKnowledge({ companyId, createdBy }) {
  const table = `${TABLE_PREFIX}knowledge_items`;
  const existingTitles = await listExistingTitles(companyId);
  const now = Date.now();
  let created = 0;

  for (const item of PLUMBING_ITEMS) {
    if (existingTitles.has(item.title.toLowerCase())) {
      continue;
    }
    const knowledgeId = uuidv4();
    const payload = {
      company_id: companyId,
      knowledge_id: knowledgeId,
      title: item.title,
      content: item.content,
      type: item.type,
      status: 'ACTIVE',
      source: 'MANUAL',
      tags: item.tags,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      type_created: `${item.type}#${now}`,
      status_updated: `ACTIVE#${now}`,
    };
    // eslint-disable-next-line no-await-in-loop
    await ddb.send(new PutCommand({ TableName: table, Item: payload }));
    created += 1;
  }

  return created;
}

async function main() {
  if (!COMPANY_EMAIL && !COMPANY_ID) {
    throw new Error('Set COMPANY_EMAIL or COMPANY_ID');
  }

  const company =
    COMPANY_ID
      ? { company_id: COMPANY_ID }
      : await findCompanyByEmail(COMPANY_EMAIL);

  if (!company) {
    throw new Error('Company not found');
  }

  const usersTable = `${TABLE_PREFIX}users`;
  const email = COMPANY_EMAIL;
  let createdBy = 'system';
  if (email) {
    const res = await ddb.send(
      new ScanCommand({
        TableName: usersTable,
        FilterExpression: '#email = :email AND #company_id = :company_id',
        ExpressionAttributeNames: { '#email': 'email', '#company_id': 'company_id' },
        ExpressionAttributeValues: { ':email': email, ':company_id': company.company_id },
        Limit: 1,
      })
    );
    if (res.Items && res.Items.length) {
      createdBy = res.Items[0].user_id || createdBy;
    }
  }

  const created = await seedKnowledge({ companyId: company.company_id, createdBy });
  console.log(`Seeded ${created} knowledge items for company ${company.company_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

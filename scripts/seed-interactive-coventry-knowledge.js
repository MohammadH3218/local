/* eslint-disable no-console */
/**
 * Seeds Interactive Coventry (company_id b2d6d09a-794f-4b0f-bb62-9e9fedd596dd)
 * with a pest-control subscription knowledge base + embeddings (Bedrock Titan).
 *
 * Requires AWS credentials with access to:
 * - DynamoDB (handycall_prod_* tables)
 * - Bedrock Runtime (amazon.titan-embed-text-v1)
 *
 * Run:
 *   node scripts/seed-interactive-coventry-knowledge.js
 */

const { randomUUID } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { OpenAI } = require('openai');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'handycall_prod_';
const COMPANY_ID = process.env.COMPANY_ID || 'b2d6d09a-794f-4b0f-bb62-9e9fedd596dd';
const EMBEDDING_MODEL_ID = process.env.OPENAI_EMBEDDING_MODEL_ID || 'text-embedding-3-small';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});
const apiKey = process.env.OPENAI_API_KEY;
let openai;
if (apiKey) {
  openai = new OpenAI({ apiKey });
} else {
  console.warn('WARNING: OPENAI_API_KEY not found. Skipping embeddings generation (keyword search fallback will be used).');
}

function splitTextIntoChunks(text, chunkSize = 500, overlap = 50) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n');
  const out = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(cleaned.length, start + chunkSize);
    out.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
  }
  return out.filter((c) => c.trim().length > 0);
}

async function generateEmbedding(text) {
  if (!openai) {
    // Return a dummy 1536-dim vector or empty if downstream supports it. 
    // DynamoDB doesn't care about content, but application might. 
    // For now, return empty array which indicates "no embedding".
    return [];
  }
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL_ID,
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.warn('Embedding generation failed:', err.message);
    return [];
  }
}

async function chunkAndStoreKnowledge(companyId, knowledgeId, fullText) {
  const chunks = splitTextIntoChunks(fullText, 500, 50);
  const tableName = `${TABLE_PREFIX}knowledge_chunks`;

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          company_knowledge: `${companyId}#${knowledgeId}`,
          chunk_index: i,
          company_id: companyId,
          chunk_id: `${knowledgeId}_chunk_${i}`,
          knowledge_id: knowledgeId,
          text: chunks[i],
          embedding,
          created_at: Date.now(),
        },
      })
    );
  }
}

async function upsertCompanyProfile() {
  const tableName = `${TABLE_PREFIX}companies`;
  const key = { company_id: COMPANY_ID };
  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: 'SET #service_type = :service, #timezone = :tz, #updated_at = :now',
      ExpressionAttributeNames: {
        '#service_type': 'service_type',
        '#timezone': 'timezone',
        '#updated_at': 'updated_at',
      },
      ExpressionAttributeValues: {
        ':service': 'PEST_CONTROL',
        ':tz': 'America/Chicago',
        ':now': Date.now(),
      },
    })
  );
}

async function upsertAgentConfig() {
  const tableName = `${TABLE_PREFIX}agent_configs`;
  const key = { company_id: COMPANY_ID };
  const existing = await ddb.send(new GetCommand({ TableName: tableName, Key: key }));
  const now = Date.now();

  const realtimeInstructions = [
    'Business facts policy:',
    '- For business-specific facts (pricing, plans, what is included, guarantees, policies, service area, scheduling rules): use knowledge_search. If it is not in knowledge_search or you are not sure, do NOT guess. Say you are not sure and you will note it down for the team to confirm.',
    '- For general safety guidance (e.g., pets/children), you may answer using general best practices AND the provided products info, but be conservative and include common-sense caveats (follow label, keep pets away until dry).',
    '- Never invent discounts, payment options, or guarantees.',
  ].join('\n');

  if (!existing || !existing.Item) {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          company_id: COMPANY_ID,
          config_id: randomUUID(),
          greeting_tone: 'FRIENDLY',
          booking_mode: 'PROPOSE_TIMES',
          can_discuss_pricing: true,
          can_handle_emergencies: false,
          escalation_threshold: 0.7,
          require_callback_confirmation: true,
          send_sms_summary: true,
          realtime_model: 'gpt-realtime-mini',
          realtime_voice: 'alloy',
          realtime_instructions: realtimeInstructions,
          created_at: now,
          updated_at: now,
        },
      })
    );
    return;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression:
        'SET #realtime_instructions = :ri, #greeting_tone = :tone, #updated_at = :now',
      ExpressionAttributeNames: {
        '#realtime_instructions': 'realtime_instructions',
        '#greeting_tone': 'greeting_tone',
        '#updated_at': 'updated_at',
      },
      ExpressionAttributeValues: {
        ':ri': realtimeInstructions,
        ':tone': 'FRIENDLY',
        ':now': now,
      },
    })
  );
}

async function createKnowledgeItem({ title, content, type, tags }) {
  const knowledgeId = randomUUID();
  const now = Date.now();
  const tableName = `${TABLE_PREFIX}knowledge_items`;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        company_id: COMPANY_ID,
        knowledge_id: knowledgeId,
        title,
        content,
        type,
        status: 'ACTIVE',
        tags: tags || [],
        type_created: `${type}#${now}`,
        status_updated: `ACTIVE#${now}`,
        created_at: now,
        updated_at: now,
      },
    })
  );

  const fullText = `${title}\n\n${content}`;
  await chunkAndStoreKnowledge(COMPANY_ID, knowledgeId, fullText);
  return knowledgeId;
}

async function main() {
  console.log('Seeding Interactive Coventry knowledge base...');
  console.log({ REGION, TABLE_PREFIX, COMPANY_ID, EMBEDDING_MODEL_ID });

  await upsertCompanyProfile();
  await upsertAgentConfig();

  const items = [
    {
      type: 'SERVICE',
      title: 'Annual Pest Control Subscription (Interactive Coventry)',
      tags: ['subscription', 'annual', 'quarterly', 'general pests'],
      content: [
        'We offer a 1-year pest control subscription designed for routine prevention and fast response if pests show up.',
        '',
        'Subscription price: $499 per year.',
        '',
        'What it includes:',
        '- Initial visit (inside + outside): a full inspection + treatment targeted to common household pests.',
        '- Follow-up visits every quarter (outside only): preventative perimeter treatment and inspection.',
        '- Between-visit support: if you see activity from covered pests, we can schedule an additional visit as needed (subject to availability).',
        '',
        'Covered pests (typical): ants, roaches, spiders, silverfish, crickets, earwigs, and other common crawlers.',
        '',
        'Not included by default (ask and we can quote): termites, bed bugs, wildlife removal, and heavy rodent infestations.',
      ].join('\n'),
    },
    {
      type: 'SERVICE',
      title: 'What happens on the first visit (inside + outside)',
      tags: ['first visit', 'inside', 'outside', 'inspection'],
      content: [
        'On the first visit we focus on both interior and exterior treatment and prevention.',
        '',
        'Inside (where we typically treat):',
        '- Baseboards and corners in kitchens, bathrooms, laundry rooms, and garages.',
        '- Entry points like door thresholds, window tracks, plumbing penetrations, and utility openings.',
        '- Targeted crack-and-crevice treatment in problem areas (not a full “fogging”).',
        '',
        'Outside (where we typically treat):',
        '- Perimeter foundation band, door frames, windows, and eaves/soffits.',
        '- Spot treatment around patios, garages, sheds, and other likely harborage areas.',
        '- Web removal around entryways as needed.',
      ].join('\n'),
    },
    {
      type: 'SERVICE',
      title: 'Quarterly visits (outside-only maintenance)',
      tags: ['quarterly', 'outside', 'maintenance'],
      content: [
        'Quarterly visits are preventative perimeter treatments focused on stopping pests before they enter.',
        '',
        'Typical quarterly service includes:',
        '- Exterior perimeter treatment around the foundation.',
        '- Entry point touch-ups (doors, windows, garage edges).',
        '- Light inspection for conducive conditions (standing water, gaps, nesting).',
        '- Recommendations to reduce pest pressure (seal gaps, trim vegetation, moisture control).',
      ].join('\n'),
    },
    {
      type: 'SERVICE',
      title: 'Rodent monitoring and trapping (optional add-on)',
      tags: ['rodents', 'traps', 'monitoring', 'add-on'],
      content: [
        'If rodents are a concern, we can set up monitoring and trapping as an add-on service.',
        '',
        'What we can do:',
        '- Place tamper-resistant bait stations or snap traps (placement depends on layout and safety).',
        '- Identify entry points and give exclusion recommendations (sealing gaps, garage door sweeps, vents).',
        '- Follow-up checks and adjustments as needed.',
        '',
        'Note: heavy infestations or wildlife issues may require a specialized quote.',
      ].join('\n'),
    },
    {
      type: 'PRODUCT',
      title: 'Products/solutions we use (overview)',
      tags: ['products', 'chemicals', 'approved', 'pesticides'],
      content: [
        'We use a mix of professional-grade products and integrated pest management (IPM) methods.',
        '',
        'Typical product categories (selection varies by pest and location):',
        '- Pyrethroids (e.g., permethrin / bifenthrin) for perimeter and targeted crawling-insect control.',
        '- Neonicotinoids (used selectively) for certain persistent pest issues.',
        '- Insect Growth Regulators (IGRs) to disrupt breeding cycles where appropriate.',
        '- Baits, gels, and dusts (e.g., boric acid or diatomaceous earth in appropriate locations) for targeted control.',
        '',
        'All products are applied according to label directions and local regulations.',
      ].join('\n'),
    },
    {
      type: 'SAFETY',
      title: 'Safety: kids and pets',
      tags: ['safety', 'pets', 'children'],
      content: [
        'Safety is a priority. We apply products according to the label and use targeted treatments instead of blanket spraying.',
        '',
        'General guidance:',
        '- Keep children and pets away from treated areas until surfaces are fully dry.',
        '- Avoid touching treated baseboards/corners right after service.',
        '- If you have fish tanks or exotic pets, let us know so we can plan treatment carefully.',
        '',
        'If you have specific concerns, we can explain the treatment plan before we begin.',
      ].join('\n'),
    },
    {
      type: 'FAQ',
      title: 'How quickly can you come out?',
      tags: ['scheduling', 'availability', 'response time'],
      content: [
        'We can usually schedule the initial visit within a few business days, depending on current availability.',
        'If you are seeing active pests, we can prioritize the earliest opening we have.',
        '',
        'To schedule, we typically ask for:',
        '- Your name and best callback number',
        '- Address + ZIP code',
        '- The pest issue and where you are seeing it',
        '- Preferred days/times',
      ].join('\n'),
    },
    {
      type: 'POLICY',
      title: 'Service area and scheduling policy',
      tags: ['service area', 'policy', 'reschedule'],
      content: [
        'We serve Coventry and surrounding areas in the greater Houston region (based on ZIP code).',
        '',
        'Scheduling notes:',
        '- Please provide your ZIP code so we can confirm service availability.',
        '- We can reschedule with notice; same-day changes may be limited depending on the route.',
      ].join('\n'),
    },
    {
      type: 'FAQ',
      title: 'What should I do to prepare for service?',
      tags: ['prep', 'home preparation', 'before visit'],
      content: [
        'Preparation helps us treat efficiently.',
        '',
        'Before the initial visit:',
        '- Clear small items from kitchen/bathroom baseboards if possible.',
        '- Let us know if you have pets, fish tanks, or areas you want us to avoid.',
        '- Point out where you are seeing activity (kitchen, garage, patio, etc.).',
        '',
        'Before quarterly exterior visits:',
        '- Ensure gates are unlocked and pets are secured.',
        '- Trim heavy vegetation touching the home if possible (it can create pest bridges).',
      ].join('\n'),
    },
  ];

  for (const item of items) {
    console.log(`Creating knowledge: [${item.type}] ${item.title}`);
    await createKnowledgeItem(item);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

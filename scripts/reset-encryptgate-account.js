/* eslint-disable no-console */
/**
 * Resets a company account to a "freshly onboarded" state while preserving
 * knowledge base + core setup/config.
 *
 * Default target company:
 *   - company_name = EncryptGate
 *
 * What this script deletes (company-scoped operational data):
 * - calls, call_highlights, contacts (customers), appointments
 * - sms, flagged_questions, usage_metrics, billing_events
 * - outbound_calls, scheduled_messages, portal_messages
 * - quote_requests, chat_sessions, invoices, customer_payments, reviews
 * - realtime_cache entries tied to deleted contacts/calls/holds
 * - S3 recordings/transcripts under the company prefix
 *
 * What this script preserves:
 * - company record + business settings
 * - knowledge_items + knowledge_chunks
 * - agent_configs, company_numbers mappings, onboarding/setup data
 * - calendars/integrations unless explicitly reset via env flags
 *
 * Run examples:
 *   node scripts/reset-encryptgate-account.js
 *   COMPANY_NAME=EncryptGate node scripts/reset-encryptgate-account.js
 *   COMPANY_ID=<uuid> node scripts/reset-encryptgate-account.js
 *   DRY_RUN=1 node scripts/reset-encryptgate-account.js
 *
 * Optional flags:
 *   KEEP_KNOWLEDGE=0        # also delete knowledge base
 *   RESET_SUBSCRIPTION=1    # remove subscription/billing linkage fields on company
 *   RESET_SCHEDULING=1      # reset scheduling/calendar setup fields on company
 *   DRY_RUN=1               # print counts/actions without deleting
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'handycall_prod_';
const COMPANY_ID_OVERRIDE = process.env.COMPANY_ID || '';
const COMPANY_NAME = process.env.COMPANY_NAME || 'EncryptGate';

const KEEP_KNOWLEDGE = process.env.KEEP_KNOWLEDGE !== '0' && process.env.KEEP_KNOWLEDGE !== 'false';
const RESET_SUBSCRIPTION = process.env.RESET_SUBSCRIPTION === '1';
const RESET_SCHEDULING = process.env.RESET_SCHEDULING === '1';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const RECORDINGS_BUCKET = process.env.RECORDINGS_BUCKET || 'handycall-recordings-prod';
const TRANSCRIPTS_BUCKET = process.env.TRANSCRIPTS_BUCKET || 'handycall-transcripts-prod';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});
const s3 = new S3Client({ region: REGION });

async function queryAll({ TableName, KeyConditionExpression, ExpressionAttributeValues, ExpressionAttributeNames }) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression,
        ExpressionAttributeValues,
        ExpressionAttributeNames,
        ExclusiveStartKey,
      })
    );
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scanAll({
  TableName,
  FilterExpression,
  ExpressionAttributeValues,
  ExpressionAttributeNames,
  ProjectionExpression,
}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName,
        FilterExpression,
        ExpressionAttributeValues,
        ExpressionAttributeNames,
        ProjectionExpression,
        ExclusiveStartKey,
      })
    );
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function batchDelete(TableName, keys) {
  if (!keys.length) return 0;
  if (DRY_RUN) return keys.length;

  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    let pending = {
      RequestItems: {
        [TableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
      },
    };

    let attempt = 0;
    while (pending && attempt < 5) {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new BatchWriteCommand(pending));
      const unprocessed = res.UnprocessedItems || {};
      pending = Object.keys(unprocessed).length ? { RequestItems: unprocessed } : null;
      attempt += 1;
      if (pending) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }

    deleted += chunk.length;
  }
  return deleted;
}

async function deleteS3Prefix(bucket, prefix) {
  let deleted = 0;
  let ContinuationToken;

  do {
    // eslint-disable-next-line no-await-in-loop
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    const contents = list.Contents || [];
    if (contents.length) {
      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: contents.map((o) => ({ Key: o.Key })) },
          })
        );
      }
      deleted += contents.length;
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return deleted;
}

async function deleteRealtimeCacheForContacts(contactIds, realtimeCacheTable) {
  if (!contactIds.length) return 0;
  if (DRY_RUN) return contactIds.length;

  let deleted = 0;
  for (const contactId of contactIds) {
    // eslint-disable-next-line no-await-in-loop
    await ddb.send(new DeleteCommand({ TableName: realtimeCacheTable, Key: { contact_id: contactId } }));
    deleted += 1;
  }
  return deleted;
}

async function resolveCompany() {
  const companiesTable = `${TABLE_PREFIX}companies`;

  if (COMPANY_ID_OVERRIDE) {
    const result = await ddb.send(
      new GetCommand({
        TableName: companiesTable,
        Key: { company_id: COMPANY_ID_OVERRIDE },
      })
    );
    if (!result.Item) throw new Error(`Company not found by COMPANY_ID=${COMPANY_ID_OVERRIDE}`);
    return result.Item;
  }

  const matches = await scanAll({
    TableName: companiesTable,
    FilterExpression: '#company_name = :name',
    ExpressionAttributeNames: { '#company_name': 'company_name' },
    ExpressionAttributeValues: { ':name': COMPANY_NAME },
  });

  if (!matches.length) {
    throw new Error(
      `No company found for company_name="${COMPANY_NAME}". Set COMPANY_ID explicitly if needed.`
    );
  }

  if (matches.length === 1) return matches[0];

  // If there are duplicates, reset the newest by created_at.
  matches.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  console.warn(`Found ${matches.length} companies named "${COMPANY_NAME}". Using newest: ${matches[0].company_id}`);
  return matches[0];
}

async function main() {
  const company = await resolveCompany();
  const companyId = company.company_id;

  console.log('Resetting company account data...');
  console.log({
    REGION,
    TABLE_PREFIX,
    COMPANY_ID: companyId,
    COMPANY_NAME: company.company_name,
    KEEP_KNOWLEDGE,
    RESET_SUBSCRIPTION,
    RESET_SCHEDULING,
    DRY_RUN,
    RECORDINGS_BUCKET,
    TRANSCRIPTS_BUCKET,
  });

  const tables = {
    calls: `${TABLE_PREFIX}calls`,
    contacts: `${TABLE_PREFIX}contacts`,
    appointments: `${TABLE_PREFIX}appointments`,
    call_highlights: `${TABLE_PREFIX}call_highlights`,
    knowledge_items: `${TABLE_PREFIX}knowledge_items`,
    knowledge_chunks: `${TABLE_PREFIX}knowledge_chunks`,
    flagged_questions: `${TABLE_PREFIX}flagged_questions`,
    sms: `${TABLE_PREFIX}sms`,
    usage_metrics: `${TABLE_PREFIX}usage_metrics`,
    billing_events: `${TABLE_PREFIX}billing_events`,
    realtime_cache: `${TABLE_PREFIX}realtime_cache`,
    companies: `${TABLE_PREFIX}companies`,
    outbound_calls: `${TABLE_PREFIX}outbound_calls`,
    scheduled_messages: `${TABLE_PREFIX}scheduled_messages`,
    portal_messages: `${TABLE_PREFIX}portal_messages`,
    quote_requests: `${TABLE_PREFIX}quote_requests`,
    chat_sessions: `${TABLE_PREFIX}chat_sessions`,
    invoices: `${TABLE_PREFIX}invoices`,
    customer_payments: `${TABLE_PREFIX}customer_payments`,
    reviews: `${TABLE_PREFIX}reviews`,
  };

  // Pull contacts/calls first so we can remove dependent data.
  const contacts = await queryAll({
    TableName: tables.contacts,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  const contactIds = contacts.map((c) => c.contact_id).filter(Boolean);

  const calls = await queryAll({
    TableName: tables.calls,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  const callIds = calls.map((c) => c.call_id).filter(Boolean);

  console.log(`Deleting calls (${calls.length})...`);
  await batchDelete(
    tables.calls,
    calls.map((c) => ({ company_id: companyId, call_id: c.call_id }))
  );

  // call_highlights keyed by company_call = company#call
  let highlightsDeleted = 0;
  for (const callId of callIds) {
    // eslint-disable-next-line no-await-in-loop
    const highlights = await queryAll({
      TableName: tables.call_highlights,
      KeyConditionExpression: 'company_call = :cc',
      ExpressionAttributeValues: { ':cc': `${companyId}#${callId}` },
    });

    // eslint-disable-next-line no-await-in-loop
    highlightsDeleted += await batchDelete(
      tables.call_highlights,
      highlights.map((h) => ({ company_call: h.company_call, timestamp_seconds: h.timestamp_seconds }))
    );
  }
  console.log(`Deleting call highlights (${highlightsDeleted})...`);

  console.log(`Deleting contacts/customers (${contacts.length})...`);
  await batchDelete(
    tables.contacts,
    contacts.map((c) => ({ company_id: companyId, contact_id: c.contact_id }))
  );

  const rtDeleted = await deleteRealtimeCacheForContacts(contactIds, tables.realtime_cache);
  console.log(`Deleting realtime cache entries (${rtDeleted})...`);

  const appts = await queryAll({
    TableName: tables.appointments,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting appointments (${appts.length})...`);
  await batchDelete(
    tables.appointments,
    appts.map((a) => ({ company_id: companyId, appointment_id: a.appointment_id }))
  );

  const sms = await queryAll({
    TableName: tables.sms,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting SMS (${sms.length})...`);
  await batchDelete(
    tables.sms,
    sms.map((s) => ({ company_id: companyId, sms_id: s.sms_id }))
  );

  const flagged = await queryAll({
    TableName: tables.flagged_questions,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting flagged questions (${flagged.length})...`);
  await batchDelete(
    tables.flagged_questions,
    flagged.map((f) => ({ company_id: companyId, flagged_id: f.flagged_id }))
  );

  const usage = await queryAll({
    TableName: tables.usage_metrics,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting usage metrics (${usage.length})...`);
  await batchDelete(
    tables.usage_metrics,
    usage.map((u) => ({ company_id: companyId, date: u.date }))
  );

  const billing = await queryAll({
    TableName: tables.billing_events,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting billing events (${billing.length})...`);
  await batchDelete(
    tables.billing_events,
    billing.map((b) => ({ company_id: companyId, event_id: b.event_id }))
  );

  const outboundCalls = await queryAll({
    TableName: tables.outbound_calls,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting outbound calls (${outboundCalls.length})...`);
  await batchDelete(
    tables.outbound_calls,
    outboundCalls.map((x) => ({ company_id: companyId, call_id: x.call_id }))
  );

  const scheduledMessages = await queryAll({
    TableName: tables.scheduled_messages,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting scheduled messages (${scheduledMessages.length})...`);
  await batchDelete(
    tables.scheduled_messages,
    scheduledMessages.map((x) => ({ company_id: companyId, message_id: x.message_id }))
  );

  const portalMessages = await queryAll({
    TableName: tables.portal_messages,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting portal messages (${portalMessages.length})...`);
  await batchDelete(
    tables.portal_messages,
    portalMessages.map((x) => ({ company_id: companyId, message_id: x.message_id }))
  );

  const quoteRequests = await queryAll({
    TableName: tables.quote_requests,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting quote requests (${quoteRequests.length})...`);
  await batchDelete(
    tables.quote_requests,
    quoteRequests.map((x) => ({ company_id: companyId, quote_id: x.quote_id }))
  );

  const chatSessions = await queryAll({
    TableName: tables.chat_sessions,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting chat sessions (${chatSessions.length})...`);
  await batchDelete(
    tables.chat_sessions,
    chatSessions.map((x) => ({ company_id: companyId, session_id: x.session_id }))
  );

  const invoices = await queryAll({
    TableName: tables.invoices,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting invoices (${invoices.length})...`);
  await batchDelete(
    tables.invoices,
    invoices.map((x) => ({ company_id: companyId, invoice_id: x.invoice_id }))
  );

  const customerPayments = await queryAll({
    TableName: tables.customer_payments,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting customer payments (${customerPayments.length})...`);
  await batchDelete(
    tables.customer_payments,
    customerPayments.map((x) => ({ company_id: companyId, payment_id: x.payment_id }))
  );

  const reviews = await queryAll({
    TableName: tables.reviews,
    KeyConditionExpression: 'provider_company_id = :c',
    ExpressionAttributeValues: { ':c': companyId },
  });
  console.log(`Deleting reviews (${reviews.length})...`);
  await batchDelete(
    tables.reviews,
    reviews.map((r) => ({ provider_company_id: companyId, review_id: r.review_id }))
  );

  if (!KEEP_KNOWLEDGE) {
    const knowledgeItems = await queryAll({
      TableName: tables.knowledge_items,
      KeyConditionExpression: 'company_id = :c',
      ExpressionAttributeValues: { ':c': companyId },
    });
    console.log(`Deleting knowledge items (${knowledgeItems.length})...`);
    await batchDelete(
      tables.knowledge_items,
      knowledgeItems.map((k) => ({ company_id: companyId, knowledge_id: k.knowledge_id }))
    );

    const chunks = await scanAll({
      TableName: tables.knowledge_chunks,
      FilterExpression: 'begins_with(company_knowledge, :p)',
      ExpressionAttributeValues: { ':p': `${companyId}#` },
      ProjectionExpression: 'company_knowledge, chunk_index',
    });
    console.log(`Deleting knowledge chunks (${chunks.length})...`);
    await batchDelete(
      tables.knowledge_chunks,
      chunks.map((c) => ({ company_knowledge: c.company_knowledge, chunk_index: c.chunk_index }))
    );
  } else {
    console.log('Skipping knowledge deletion (KEEP_KNOWLEDGE=1).');
  }

  console.log('Deleting S3 recordings/transcripts...');
  const recordingsDeleted = await deleteS3Prefix(RECORDINGS_BUCKET, `recordings/${companyId}/`);
  const transcriptsDeleted = await deleteS3Prefix(TRANSCRIPTS_BUCKET, `transcripts/${companyId}/`);
  console.log(`Deleted recordings objects: ${recordingsDeleted}`);
  console.log(`Deleted transcripts objects: ${transcriptsDeleted}`);

  // Optionally reset subscription/scheduling fields.
  if (RESET_SUBSCRIPTION || RESET_SCHEDULING) {
    const setExpr = [];
    const removeExpr = [];
    const names = {};
    const values = {};

    if (RESET_SUBSCRIPTION) {
      removeExpr.push(
        '#subscription_plan',
        '#subscription_status',
        '#stripe_subscription_id',
        '#stripe_customer_id',
        '#current_period_start',
        '#current_period_end',
        '#payment_method_last4',
        '#payment_method_brand',
        '#subscription_tier',
        '#trial_ends_at',
        '#trial_used_at',
        '#cancel_at_period_end',
        '#usage_service_blocked'
      );
      names['#subscription_plan'] = 'subscription_plan';
      names['#subscription_status'] = 'subscription_status';
      names['#stripe_subscription_id'] = 'stripe_subscription_id';
      names['#stripe_customer_id'] = 'stripe_customer_id';
      names['#current_period_start'] = 'current_period_start';
      names['#current_period_end'] = 'current_period_end';
      names['#payment_method_last4'] = 'payment_method_last4';
      names['#payment_method_brand'] = 'payment_method_brand';
      names['#subscription_tier'] = 'subscription_tier';
      names['#trial_ends_at'] = 'trial_ends_at';
      names['#trial_used_at'] = 'trial_used_at';
      names['#cancel_at_period_end'] = 'cancel_at_period_end';
      names['#usage_service_blocked'] = 'usage_service_blocked';
    }

    if (RESET_SCHEDULING) {
      setExpr.push(
        '#calendar_setup_completed = :false',
        '#schedule_setup_completed = :false',
        '#calendar_mode = :internal',
        '#calendar_provider = :none',
        '#business_hours = :empty_hours',
        '#schedule_overrides = :empty_overrides',
        '#timezone = :empty_tz'
      );
      removeExpr.push('#calendar_connection', '#appointment_duration_minutes', '#slot_interval_minutes');
      names['#calendar_setup_completed'] = 'calendar_setup_completed';
      names['#schedule_setup_completed'] = 'schedule_setup_completed';
      names['#calendar_mode'] = 'calendar_mode';
      names['#calendar_provider'] = 'calendar_provider';
      names['#calendar_connection'] = 'calendar_connection';
      names['#business_hours'] = 'business_hours';
      names['#schedule_overrides'] = 'schedule_overrides';
      names['#appointment_duration_minutes'] = 'appointment_duration_minutes';
      names['#slot_interval_minutes'] = 'slot_interval_minutes';
      names['#timezone'] = 'timezone';
      values[':false'] = false;
      values[':internal'] = 'INTERNAL';
      values[':none'] = 'NONE';
      values[':empty_hours'] = {};
      values[':empty_overrides'] = [];
      values[':empty_tz'] = '';
    }

    const updateExpression = [
      setExpr.length ? `SET ${setExpr.join(', ')}` : '',
      removeExpr.length ? `REMOVE ${removeExpr.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (updateExpression) {
      console.log('Resetting company subscription/scheduling flags...');
      if (!DRY_RUN) {
        await ddb.send(
          new UpdateCommand({
            TableName: tables.companies,
            Key: { company_id: companyId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
          })
        );
      }
    }
  }

  console.log(DRY_RUN ? 'Dry run complete.' : 'Reset complete.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});

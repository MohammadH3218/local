/* eslint-disable no-console */
/**
 * Resets Interactive Coventry tenant data (company_id b2d6d09a-794f-4b0f-bb62-9e9fedd596dd)
 * while preserving the Twilio claimed phone number mapping in handycall_prod_company_numbers.
 *
 * Deletes (scoped to company):
 * - calls, call_highlights, contacts, appointments
 * - knowledge_items, knowledge_chunks
 * - sms, flagged_questions, usage_metrics, billing_events
 * - realtime_cache entries for the deleted contacts
 * - S3 recordings/transcripts under the company prefix
 *
 * Run:
 *   node scripts/reset-interactive-coventry.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'handycall_prod_';
const COMPANY_ID = process.env.COMPANY_ID || 'b2d6d09a-794f-4b0f-bb62-9e9fedd596dd';
const KEEP_KNOWLEDGE = process.env.KEEP_KNOWLEDGE !== '0' && process.env.KEEP_KNOWLEDGE !== 'false';
const RESET_SUBSCRIPTION = process.env.RESET_SUBSCRIPTION === '1';
const RESET_SCHEDULING = process.env.RESET_SCHEDULING === '1';

const RECORDINGS_BUCKET = process.env.RECORDINGS_BUCKET || 'handycall-recordings-prod';
const TRANSCRIPTS_BUCKET = process.env.TRANSCRIPTS_BUCKET || 'handycall-transcripts-prod';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});
const s3 = new S3Client({ region: REGION });

async function queryAll({ TableName, KeyConditionExpression, ExpressionAttributeValues, ExpressionAttributeNames }) {
  const items = [];
  let ExclusiveStartKey = undefined;
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

async function scanAll({ TableName, FilterExpression, ExpressionAttributeValues, ExpressionAttributeNames, ProjectionExpression }) {
  const items = [];
  let ExclusiveStartKey = undefined;
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
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    const req = {
      RequestItems: {
        [TableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
      },
    };
    // Retry unprocessed items a few times
    let attempt = 0;
    let unprocessed = req;
    while (attempt < 5 && unprocessed && Object.keys(unprocessed.RequestItems || {}).length > 0) {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new BatchWriteCommand(unprocessed));
      const next = res.UnprocessedItems && Object.keys(res.UnprocessedItems).length ? { RequestItems: res.UnprocessedItems } : null;
      unprocessed = next;
      attempt++;
      if (unprocessed) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteS3Prefix(bucket, prefix) {
  let deleted = 0;
  let ContinuationToken = undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    const contents = list.Contents || [];
    if (contents.length) {
      // eslint-disable-next-line no-await-in-loop
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: contents.map((o) => ({ Key: o.Key })) },
        })
      );
      deleted += contents.length;
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
}

async function main() {
  console.log('Resetting Interactive Coventry tenant data...');
  console.log({ REGION, TABLE_PREFIX, COMPANY_ID, RECORDINGS_BUCKET, TRANSCRIPTS_BUCKET });

  const callsTable = `${TABLE_PREFIX}calls`;
  const contactsTable = `${TABLE_PREFIX}contacts`;
  const appointmentsTable = `${TABLE_PREFIX}appointments`;
  const highlightsTable = `${TABLE_PREFIX}call_highlights`;
  const knowledgeItemsTable = `${TABLE_PREFIX}knowledge_items`;
  const knowledgeChunksTable = `${TABLE_PREFIX}knowledge_chunks`;
  const flaggedTable = `${TABLE_PREFIX}flagged_questions`;
  const smsTable = `${TABLE_PREFIX}sms`;
  const usageTable = `${TABLE_PREFIX}usage_metrics`;
  const billingEventsTable = `${TABLE_PREFIX}billing_events`;
  const realtimeCacheTable = `${TABLE_PREFIX}realtime_cache`;
  const companiesTable = `${TABLE_PREFIX}companies`;

  // Fetch contact ids before deleting contacts so we can clear realtime cache.
  const contacts = await queryAll({
    TableName: contactsTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  const contactIds = contacts.map((c) => c.contact_id).filter(Boolean);

  // Fetch call ids before deleting calls so we can clear highlights.
  const calls = await queryAll({
    TableName: callsTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  const callIds = calls.map((c) => c.call_id).filter(Boolean);

  // Calls
  console.log(`Deleting calls (${calls.length})...`);
  await batchDelete(
    callsTable,
    calls.map((c) => ({ company_id: COMPANY_ID, call_id: c.call_id }))
  );

  // Call highlights (partitioned by company_call = company#call)
  let highlightCount = 0;
  for (const callId of callIds) {
    // eslint-disable-next-line no-await-in-loop
    const highlights = await queryAll({
      TableName: highlightsTable,
      KeyConditionExpression: 'company_call = :cc',
      ExpressionAttributeValues: { ':cc': `${COMPANY_ID}#${callId}` },
    });
    highlightCount += highlights.length;
    // eslint-disable-next-line no-await-in-loop
    await batchDelete(
      highlightsTable,
      highlights.map((h) => ({ company_call: h.company_call, timestamp_seconds: h.timestamp_seconds }))
    );
  }
  console.log(`Deleted call highlights (${highlightCount})`);

  // Contacts
  console.log(`Deleting contacts (${contacts.length})...`);
  await batchDelete(
    contactsTable,
    contacts.map((c) => ({ company_id: COMPANY_ID, contact_id: c.contact_id }))
  );

  // Realtime cache by contact_id (pk only)
  if (contactIds.length) {
    console.log(`Deleting realtime cache entries (${contactIds.length})...`);
    for (const contactId of contactIds) {
      // eslint-disable-next-line no-await-in-loop
      await ddb.send(new DeleteCommand({ TableName: realtimeCacheTable, Key: { contact_id: contactId } }));
    }
  }

  // Appointments
  const appts = await queryAll({
    TableName: appointmentsTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  console.log(`Deleting appointments (${appts.length})...`);
  await batchDelete(
    appointmentsTable,
    appts.map((a) => ({ company_id: COMPANY_ID, appointment_id: a.appointment_id }))
  );

  if (!KEEP_KNOWLEDGE) {
    // Knowledge items
    const kis = await queryAll({
      TableName: knowledgeItemsTable,
      KeyConditionExpression: 'company_id = :c',
      ExpressionAttributeValues: { ':c': COMPANY_ID },
    });
    console.log(`Deleting knowledge items (${kis.length})...`);
    await batchDelete(
      knowledgeItemsTable,
      kis.map((k) => ({ company_id: COMPANY_ID, knowledge_id: k.knowledge_id }))
    );

    // Knowledge chunks (partition key is company_knowledge = company#knowledgeId)
    const chunks = await scanAll({
      TableName: knowledgeChunksTable,
      FilterExpression: 'begins_with(company_knowledge, :p)',
      ExpressionAttributeValues: { ':p': `${COMPANY_ID}#` },
      ProjectionExpression: 'company_knowledge, chunk_index',
    });
    console.log(`Deleting knowledge chunks (${chunks.length})...`);
    await batchDelete(
      knowledgeChunksTable,
      chunks.map((c) => ({ company_knowledge: c.company_knowledge, chunk_index: c.chunk_index }))
    );
  } else {
    console.log('Skipping knowledge deletion (KEEP_KNOWLEDGE=1).');
  }

  // Flagged questions
  const flagged = await queryAll({
    TableName: flaggedTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  console.log(`Deleting flagged questions (${flagged.length})...`);
  await batchDelete(
    flaggedTable,
    flagged.map((f) => ({ company_id: COMPANY_ID, flagged_id: f.flagged_id }))
  );

  // SMS
  const sms = await queryAll({
    TableName: smsTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  console.log(`Deleting SMS (${sms.length})...`);
  await batchDelete(
    smsTable,
    sms.map((s) => ({ company_id: COMPANY_ID, sms_id: s.sms_id }))
  );

  // Usage metrics
  const usage = await queryAll({
    TableName: usageTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  console.log(`Deleting usage metrics (${usage.length})...`);
  await batchDelete(
    usageTable,
    usage.map((u) => ({ company_id: COMPANY_ID, date: u.date }))
  );

  // Billing events
  const billing = await queryAll({
    TableName: billingEventsTable,
    KeyConditionExpression: 'company_id = :c',
    ExpressionAttributeValues: { ':c': COMPANY_ID },
  });
  console.log(`Deleting billing events (${billing.length})...`);
  await batchDelete(
    billingEventsTable,
    billing.map((b) => ({ company_id: COMPANY_ID, event_id: b.event_id }))
  );

  // S3 prefixes
  console.log('Deleting S3 transcripts/recordings for company...');
  const deletedRecordings = await deleteS3Prefix(RECORDINGS_BUCKET, `recordings/${COMPANY_ID}/`);
  const deletedTranscripts = await deleteS3Prefix(TRANSCRIPTS_BUCKET, `transcripts/${COMPANY_ID}/`);
  console.log(`Deleted S3 recordings: ${deletedRecordings}`);
  console.log(`Deleted S3 transcripts: ${deletedTranscripts}`);

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
        '#cancel_at_period_end'
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
      await ddb.send(
        new UpdateCommand({
          TableName: companiesTable,
          Key: { company_id: COMPANY_ID },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
        })
      );
    }
  }

  console.log('Reset complete.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});

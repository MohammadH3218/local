const AWS = require('aws-sdk');
const crypto = require('crypto');

const ddb = new AWS.DynamoDB.DocumentClient();
const kms = new AWS.KMS();

const TABLE = process.env.WEBHOOK_CONFIG_TABLE;
const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 6000);
const USER_AGENT = process.env.WEBHOOK_USER_AGENT || 'HandyCall-Webhooks/1.0';
const KMS_PREFIX = 'kms:';

exports.handler = async (event) => {
  const failures = [];
  const records = Array.isArray(event?.Records) ? event.Records : [];

  for (const record of records) {
    try {
      await processRecord(record);
    } catch (err) {
      console.error('[webhook-delivery] failed', {
        messageId: record?.messageId,
        error: err?.message ?? String(err),
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

async function processRecord(record) {
  if (!record?.body) return;
  const message = JSON.parse(record.body);
  const payload = message?.payload;
  const companyId = message?.company_id || payload?.company_id;
  if (!payload || !companyId) return;

  const config = await loadConfig(companyId);
  if (!config || config.is_enabled === false || !config.webhook_url) return;

  if (Array.isArray(config.enabled_events) && config.enabled_events.length > 0) {
    if (!config.enabled_events.includes(payload.event)) return;
  }

  const result = await deliver(config, payload);
  await recordDelivery(companyId, payload.event, result.ok, result.status, result.error);

  if (!result.ok) {
    throw new Error(result.error || `Webhook delivery failed (${result.status || 'no-status'})`);
  }
}

async function loadConfig(companyId) {
  if (!TABLE) return null;
  const res = await ddb
    .get({
      TableName: TABLE,
      Key: { company_id: companyId },
    })
    .promise();
  const item = res.Item || null;
  if (!item) return null;
  return await decryptConfig(item);
}

async function decryptConfig(item) {
  const output = { ...item };
  if (typeof output.webhook_url === 'string') {
    output.webhook_url = await decryptString(output.webhook_url);
  }
  if (typeof output.signing_secret === 'string') {
    output.signing_secret = await decryptString(output.signing_secret);
  }
  return output;
}

async function decryptString(value) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith(KMS_PREFIX)) return value;
  const encoded = value.slice(KMS_PREFIX.length);
  const res = await kms.decrypt({ CiphertextBlob: Buffer.from(encoded, 'base64') }).promise();
  if (!res.Plaintext) return value;
  return Buffer.from(res.Plaintext).toString('utf8');
}

function buildSignature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

async function deliver(config, payload) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildSignature(config.signing_secret, timestamp, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-HandyCall-Event': payload.event,
        'X-HandyCall-Timestamp': timestamp,
        'X-HandyCall-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      response_time_ms: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message ?? 'Webhook delivery failed',
      response_time_ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordDelivery(companyId, event, ok, status, error) {
  if (!TABLE) return;
  const now = Date.now();
  const statusCode = typeof status === 'number' ? status : ok ? undefined : 0;

  const updates = {
    last_delivery_at: now,
    last_event: event,
    ...(typeof statusCode === 'number' ? { last_status_code: statusCode } : {}),
    ...(ok ? { last_success_at: now, last_error: '' } : { last_error: error || 'Delivery failed' }),
  };

  const expr = [];
  const names = {};
  const values = {};
  let idx = 0;
  for (const [key, value] of Object.entries(updates)) {
    idx += 1;
    const nameKey = `#k${idx}`;
    const valueKey = `:v${idx}`;
    expr.push(`${nameKey} = ${valueKey}`);
    names[nameKey] = key;
    values[valueKey] = value;
  }

  await ddb
    .update({
      TableName: TABLE,
      Key: { company_id: companyId },
      UpdateExpression: `SET ${expr.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
    .promise();
}

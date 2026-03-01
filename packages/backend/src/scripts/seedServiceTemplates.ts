import * as fs from 'node:fs';
import * as path from 'node:path';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

async function main() {
  const file = path.resolve(__dirname, '../../seeds/service_templates.seed.json');
  console.log('Loading seed from:', file);
  
  if (!fs.existsSync(file)) {
    console.error('Seed file not found!');
    process.exit(1);
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);

  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const tableName = process.env.SERVICE_TEMPLATES_TABLE || 'handycall_dev_service_templates';

  console.log('Target table:', tableName);

  for (const tmpl of data.templates) {
    try {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: marshall(tmpl, { removeUndefinedValues: true })
        })
      );
      console.log('Seeded:', tmpl.template_id);
    } catch (err) {
      console.error('Error seeding', tmpl.template_id, ':', err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

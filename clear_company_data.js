const { DynamoDBClient, QueryCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const REGION = "us-east-1";
const COMPANY_ID = "b2d6d09a-794f-4b0f-bb62-9e9fedd596dd";

const TABLES = [
    { name: "handycall_prod_calls", pk: "company_id", sk: "call_id" },
    { name: "handycall_prod_contacts", pk: "company_id", sk: "contact_id" },
    { name: "handycall_prod_appointments", pk: "company_id", sk: "appointment_id" },
    { name: "handycall_prod_sms", pk: "company_id", sk: "sms_id" },
    { name: "handycall_prod_flagged_questions", pk: "company_id", sk: "flagged_id" },
    { name: "handycall_prod_usage_metrics", pk: "company_id", sk: "date" }
];

async function clearTable(client, tableConfig) {
    console.log(`Clearing ${tableConfig.name}...`);
    const queryCommand = new QueryCommand({
        TableName: tableConfig.name,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": tableConfig.pk },
        ExpressionAttributeValues: marshall({ ":pk": COMPANY_ID })
    });

    const response = await client.send(queryCommand);
    if (response.Items && response.Items.length > 0) {
        console.log(`Found ${response.Items.length} items to delete in ${tableConfig.name}`);
        for (const item of response.Items) {
            const unmarshalled = unmarshall(item);
            const key = {};
            key[tableConfig.pk] = unmarshalled[tableConfig.pk];
            if (tableConfig.sk) {
                key[tableConfig.sk] = unmarshalled[tableConfig.sk];
            }

            await client.send(new DeleteItemCommand({
                TableName: tableConfig.name,
                Key: marshall(key)
            }));
        }
    } else {
        console.log(`No items found in ${tableConfig.name}`);
    }
}

async function run() {
    const client = new DynamoDBClient({ region: REGION });
    for (const table of TABLES) {
        try {
            await clearTable(client, table);
        } catch (err) {
            console.error(`Error clearing ${table.name}:`, err.message);
        }
    }
    console.log("Cleanup complete!");
}

run().catch(console.error);

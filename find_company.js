const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

async function find() {
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new ScanCommand({
        TableName: "handycall_prod_companies",
        FilterExpression: "email = :e",
        ExpressionAttributeValues: {
            ":e": { S: "toushe3219@gmail.com" }
        }
    });

    const response = await client.send(command);
    if (response.Items && response.Items.length > 0) {
        const company = unmarshall(response.Items[0]);
        console.log(company.company_id);
    } else {
        console.log("No company found");
    }
}

find().catch(console.error);

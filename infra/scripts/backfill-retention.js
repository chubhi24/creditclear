// One-off: gives applications saved before the 90-day retention rule an expiresAt date
// (90 days after their createdAt) and removes any stored email address.
// Uses the API's AWS SDK packages; pass the ApplicationsTable stack output. From infra/:
//   NODE_PATH=src/node_modules node scripts/backfill-retention.js <table-name>
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = "us-east-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

(async () => {
  const TableName = process.argv[2];
  if (!TableName) {
    console.error("Usage (from infra/): NODE_PATH=src/node_modules node scripts/backfill-retention.js <table-name>");
    process.exit(1);
  }
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({ TableName, ProjectionExpression: "applicationId, createdAt, expiresAt, email", ExclusiveStartKey }),
    );
    items.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  let dated = 0;
  let stripped = 0;
  for (const it of items) {
    const parts = [];
    const values = {};
    if (!it.expiresAt) {
      values[":e"] = Math.floor(Date.parse(it.createdAt) / 1000) + 90 * 86400;
      parts.push("SET expiresAt = :e");
      dated++;
    }
    if (it.email) {
      parts.push("REMOVE email");
      stripped++;
    }
    if (!parts.length) continue;
    await ddb.send(
      new UpdateCommand({
        TableName,
        Key: { applicationId: it.applicationId },
        UpdateExpression: parts.join(" "),
        ...(values[":e"] ? { ExpressionAttributeValues: values } : {}),
      }),
    );
  }
  console.log(`${items.length} applications checked: ${dated} given a delete date, ${stripped} emails removed.`);
})();

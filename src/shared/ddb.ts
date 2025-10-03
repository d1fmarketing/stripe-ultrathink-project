import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { wrapClientSendWithRetry } from "./retry";

const REGION = process.env.AWS_REGION || "us-east-1";
const client = wrapClientSendWithRetry(new DynamoDBClient({ region: REGION }));
export const ddb = wrapClientSendWithRetry(
  DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  })
);

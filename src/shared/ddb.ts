import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "node:https";

const REGION = process.env.AWS_REGION || "us-east-1";
const MAX_SOCKETS = Number(process.env.DDB_MAX_SOCKETS ?? 50);
const CONNECTION_TIMEOUT = Number(process.env.DDB_CONNECTION_TIMEOUT ?? 5000);
const SOCKET_TIMEOUT = Number(process.env.DDB_SOCKET_TIMEOUT ?? 5000);

const httpsAgent = new Agent({
  keepAlive: true,
  maxSockets: MAX_SOCKETS,
});

const requestHandler = new NodeHttpHandler({
  connectionTimeout: CONNECTION_TIMEOUT,
  socketTimeout: SOCKET_TIMEOUT,
  httpsAgent,
});

const createNativeClient = () =>
  new DynamoDBClient({
    region: REGION,
    maxAttempts: Number(process.env.DDB_MAX_ATTEMPTS ?? 3),
    requestHandler,
  });

const createDocumentClient = (client: DynamoDBClient) =>
  DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

declare global {
  // eslint-disable-next-line no-var
  var __DDB_NATIVE_CLIENT__: DynamoDBClient | undefined;
  // eslint-disable-next-line no-var
  var __DDB_DOC_CLIENT__: DynamoDBDocumentClient | undefined;
}

const getNativeClient = (): DynamoDBClient => {
  if (!globalThis.__DDB_NATIVE_CLIENT__) {
    globalThis.__DDB_NATIVE_CLIENT__ = createNativeClient();
  }

  return globalThis.__DDB_NATIVE_CLIENT__;
};

const getDocumentClient = (): DynamoDBDocumentClient => {
  if (!globalThis.__DDB_DOC_CLIENT__) {
    globalThis.__DDB_DOC_CLIENT__ = createDocumentClient(getNativeClient());
  }

  return globalThis.__DDB_DOC_CLIENT__;
};

export const dynamoClient = getNativeClient();
export const ddb = getDocumentClient();

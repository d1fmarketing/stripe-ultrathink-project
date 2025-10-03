import { ddb } from "./ddb.js";
import { PutCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const MERCHANT_PK_PREFIX = "MERCHANT#";

function encodeNextToken(key: Record<string, any> | undefined) {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
}

function decodeNextToken(token?: string) {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

const MERCHANTS = process.env.MERCHANTS_TABLE!;
const CASES = process.env.CASES_TABLE!;

export async function putMerchant(m:any){
  // Use stripe_account_id as the primary key for consistency
  const merchant_id = m.stripe_account_id || m.merchant_id;
  const item = {
    pk: `MERCHANT#${merchant_id}`,
    merchant_id: merchant_id,
    stripe_account_id: merchant_id, // Ensure both fields are set
    ...m,
    created_at: m.created_at || new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: MERCHANTS, Item: item }));
}

export async function getMerchantByAccount(stripe_account_id:string){
  const pk = `MERCHANT#${stripe_account_id}`;
  const r = await ddb.send(new GetCommand({ TableName: MERCHANTS, Key: { pk } }));
  return r.Item || { pk, merchant_id: stripe_account_id, stripe_account_id, settings: { autoSubmit: true, autoAcceptBelowCents: 0, retentionDays: 540, notifyEmails: [] } };
}

export async function upsertCase(merchantId:string, dispute:any, extras:any={}){
  const now = Math.floor(Date.now()/1000);
  const merchantPk = `${MERCHANT_PK_PREFIX}${merchantId}`;
  const caseId = dispute.id || extras.case_id;
  const dueByEpoch = dispute.evidence_details?.due_by || extras.due_by_epoch || null;
  const createdEpoch = typeof dispute.created === "number" ? dispute.created : (extras.created_at_epoch || now);
  const status = dispute.status || extras.status || "unknown";
  const statusPartition = `STATUS#${status}#${merchantId}`;
  const rawCustomerId = extras.customerId
    || extras.customer_id
    || (typeof dispute.customer === "string" ? dispute.customer : undefined)
    || (typeof dispute?.charge === "object" && dispute.charge && typeof dispute.charge.customer === "string"
      ? dispute.charge.customer
      : undefined);
  const needsExistingFetch = (!rawCustomerId && extras.customerId === undefined && extras.customer_id === undefined)
    || extras.order_id === undefined
    || extras.refunded === undefined;
  let existingItem: Record<string, any> | undefined;
  if (needsExistingFetch && caseId) {
    const existing = await ddb.send(new GetCommand({
      TableName: CASES,
      Key: { pk: merchantPk, sk: `CASE#${caseId}` }
    }));
    existingItem = existing.Item as Record<string, any> | undefined;
  }
  const compositeCustomerId = rawCustomerId
    ? `${merchantId}#${rawCustomerId}`
    : existingItem?.customerId;
  const customerIdRaw = rawCustomerId ?? existingItem?.customerIdRaw;
  const orderId = extras.order_id !== undefined ? extras.order_id : existingItem?.order_id;
  const refunded = extras.refunded !== undefined ? extras.refunded : existingItem?.refunded;
  const item = {
    pk: merchantPk,
    sk: `CASE#${caseId}`,
    caseId,
    dispute_id: caseId,
    charge_id: dispute.charge,
    payment_intent_id: dispute.payment_intent,
    amount_cents: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status,
    created_at_epoch: createdEpoch,
    updated_at_epoch: now,
    result_at_epoch: (['won','lost'].includes(status) ? now : undefined),
    due_by_epoch: dueByEpoch,
    merchantId,
    createdAt: createdEpoch,
    customerId: compositeCustomerId,
    customerIdRaw,
    order_id: orderId,
    refunded,
    gsi1_pk: merchantPk,
    gsi1_sk: dueByEpoch || createdEpoch,
    gsi2_pk: statusPartition,
    gsi2_sk: dueByEpoch || createdEpoch,
    ...extras
  };
  await ddb.send(new PutCommand({ TableName: CASES, Item: item }));
  return item;
}

interface ListCasesOptions {
  status?: string;
  limit?: number;
  cursor?: string;
  sortBy?: "created" | "due";
}

interface ListCasesResult<T = any> {
  items: T[];
  cursor?: string;
}

export async function listCases(merchantId:string, options: ListCasesOptions = {}): Promise<ListCasesResult> {
  const { status, limit, cursor, sortBy } = options;
  const exclusiveStartKey = decodeNextToken(cursor);
  let response;

  if (status) {
    response = await ddb.send(new QueryCommand({
      TableName: CASES,
      IndexName: "gsi2",
      KeyConditionExpression: "gsi2_pk = :pk",
      ExpressionAttributeValues: { ":pk": `STATUS#${status}#${merchantId}` },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));
  } else if (sortBy === "due") {
    response = await ddb.send(new QueryCommand({
      TableName: CASES,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1_pk = :pk",
      ExpressionAttributeValues: { ":pk": `${MERCHANT_PK_PREFIX}${merchantId}` },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: true
    }));
  } else {
    response = await ddb.send(new QueryCommand({
      TableName: CASES,
      IndexName: "ByMerchantByCreatedAt",
      KeyConditionExpression: "merchantId = :merchant",
      ExpressionAttributeValues: {
        ":merchant": merchantId
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: false
    }));
  }

  return {
    items: response.Items || [],
    cursor: encodeNextToken(response.LastEvaluatedKey)
  };
}

export async function getCase(merchantId:string, disputeId:string){
  const pk = `MERCHANT#${merchantId}`, sk = `CASE#${disputeId}`;
  const r = await ddb.send(new GetCommand({ TableName: CASES, Key: { pk, sk } }));
  return r.Item;
}

export async function scanMerchants(){
  const items:any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const r = await ddb.send(new ScanCommand({
      TableName: MERCHANTS,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: "pk, merchant_id, stripe_account_id, access_token, refresh_token, token_refreshed_at, oauth_connected_at"
    }));
    items.push(...(r.Items || []));
    lastEvaluatedKey = r.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

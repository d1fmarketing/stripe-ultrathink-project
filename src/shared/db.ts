import { ddb } from "./ddb.js";
import { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const MERCHANTS = process.env.MERCHANTS_TABLE!;
const CASES = process.env.CASES_TABLE!;

type MerchantUpdateMap = Record<string, unknown>;

function buildMerchantUpdateCommand(merchantId: string, updates: MerchantUpdateMap) {
  const pk = `MERCHANT#${merchantId}`;
  const timestamp = new Date().toISOString();

  const expressionAttributeNames: Record<string, string> = {
    "#merchant_id": "merchant_id",
    "#stripe_account_id": "stripe_account_id",
    "#updated_at": "updated_at",
    "#created_at": "created_at"
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ":merchant_id": merchantId,
    ":stripe_account_id": merchantId,
    ":updated_at": timestamp,
    ":created_at": timestamp
  };

  const setExpressions = [
    "#updated_at = :updated_at",
    "#merchant_id = if_not_exists(#merchant_id, :merchant_id)",
    "#stripe_account_id = if_not_exists(#stripe_account_id, :stripe_account_id)",
    "#created_at = if_not_exists(#created_at, :created_at)"
  ];

  let index = 0;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const attributeName = `#attr${index}`;
    const attributeValue = `:val${index}`;
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = value;
    setExpressions.push(`${attributeName} = ${attributeValue}`);
    index++;
  }

  return {
    Key: { pk },
    TableName: MERCHANTS,
    UpdateExpression: `SET ${setExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };
}

export async function updateMerchantAttributes(merchantId: string, updates: MerchantUpdateMap) {
  const commandInput = buildMerchantUpdateCommand(merchantId, updates);
  await ddb.send(new UpdateCommand(commandInput));
}

type MerchantTokenUpdates = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  stripe_publishable_key?: string;
  scope?: string;
  livemode?: boolean;
  firebase_uid?: string | null;
  oauth_connected_at?: string;
  token_refreshed_at?: string;
};

export async function updateMerchantTokens(merchantId: string, updates: MerchantTokenUpdates) {
  const filteredUpdates: MerchantUpdateMap = {};
  const allowedKeys: (keyof MerchantTokenUpdates)[] = [
    "access_token",
    "refresh_token",
    "token_type",
    "stripe_publishable_key",
    "scope",
    "livemode",
    "firebase_uid",
    "oauth_connected_at",
    "token_refreshed_at"
  ];

  for (const key of allowedKeys) {
    const value = updates[key];
    if (value !== undefined) {
      filteredUpdates[key] = value;
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return;
  }

  const hasRefreshTimestamp = Object.prototype.hasOwnProperty.call(filteredUpdates, "token_refreshed_at");
  const hasTokenChange = updates.access_token !== undefined || updates.refresh_token !== undefined;

  if (!hasRefreshTimestamp && (updates.token_refreshed_at !== undefined || hasTokenChange)) {
    filteredUpdates["token_refreshed_at"] = updates.token_refreshed_at ?? new Date().toISOString();
  }

  await updateMerchantAttributes(merchantId, filteredUpdates);
}

type MerchantWebhookUpdates = {
  webhook_endpoint_id?: string | null;
  webhook_secret?: string | null;
  webhook_status?: string;
};

export async function updateMerchantWebhook(merchantId: string, updates: MerchantWebhookUpdates) {
  const filteredUpdates: MerchantUpdateMap = {};
  const allowedKeys: (keyof MerchantWebhookUpdates)[] = [
    "webhook_endpoint_id",
    "webhook_secret",
    "webhook_status"
  ];

  for (const key of allowedKeys) {
    const value = updates[key];
    if (value !== undefined) {
      filteredUpdates[key] = value;
    }
  }

  filteredUpdates.webhook_updated_at = new Date().toISOString();

  await updateMerchantAttributes(merchantId, filteredUpdates);
}

export async function getMerchantByAccount(stripe_account_id:string){
  const pk = `MERCHANT#${stripe_account_id}`;
  const r = await ddb.send(new GetCommand({ TableName: MERCHANTS, Key: { pk } }));
  return r.Item || { pk, merchant_id: stripe_account_id, stripe_account_id, settings: { autoSubmit: true, autoAcceptBelowCents: 0, retentionDays: 540, notifyEmails: [] } };
}

export async function upsertCase(merchantId:string, dispute:any, extras:any={}){
  const now = Math.floor(Date.now()/1000);
  const item = {
    pk: `MERCHANT#${merchantId}`,
    sk: `CASE#${dispute.id}`,
    dispute_id: dispute.id,
    charge_id: dispute.charge,
    payment_intent_id: dispute.payment_intent,
    amount_cents: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    created_at_epoch: dispute.created || now,
    updated_at_epoch: now,
    result_at_epoch: (['won','lost'].includes(dispute.status) ? now : undefined),
    due_by_epoch: dispute.evidence_details?.due_by || null,
    gsi1_pk: dispute.evidence_details?.due_by ? new Date((dispute.evidence_details.due_by*1000)).toISOString().slice(0,10).replace(/-/g,'') : 'NA',
    gsi1_sk: dispute.evidence_details?.due_by || 0,
    gsi2_pk: `STATUS#${dispute.status}`,
    gsi2_sk: dispute.evidence_details?.due_by || 0,
    ...extras
  };
  await ddb.send(new PutCommand({ TableName: CASES, Item: item }));
  return item;
}

export async function listCases(merchantId:string, status?:string){
  const pk = `MERCHANT#${merchantId}`;
  const r = await ddb.send(new QueryCommand({
    TableName: CASES,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": pk }
  }));
  let items = r.Items || [];
  if(status) items = items.filter(i => i.status === status);
  return items.sort((a,b) => (a.due_by_epoch||0)-(b.due_by_epoch||0));
}

export async function getCase(merchantId:string, disputeId:string){
  const pk = `MERCHANT#${merchantId}`, sk = `CASE#${disputeId}`;
  const r = await ddb.send(new GetCommand({ TableName: CASES, Key: { pk, sk } }));
  return r.Item;
}

export async function scanMerchants(){
  const r = await ddb.send(new ScanCommand({ TableName: MERCHANTS }));
  return r.Items || [];
}

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { getRedisClient, isRedisReady } from "../cache/redisConnection";
import { getRequestOrigin, handleCorsPreflight, jsonResponse } from "../shared/responses.js";

const dynamo = new DynamoDBClient({});

const withTimeout = <T>(p: Promise<T>, ms = 350) =>
  Promise.race([
    p, 
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]);

export const handler = async (event: any, ctx: any) => {
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'GET,OPTIONS');
  if (preflight) return preflight;

  if (ctx && typeof ctx === 'object') {
    ctx.callbackWaitsForEmptyEventLoop = false;
  }

  const checks: any = { redis: {}, dynamo: {} };
  let degraded = false;

  // Redis check - use connection manager
  try {
    if (isRedisReady()) {
      // Already connected
      checks.redis = { ok: true, status: 'ready' };
    } else {
      // Try to connect
      const redis = await withTimeout(getRedisClient(), 500);
      if (redis) {
        await withTimeout(redis.ping(), 250);
        checks.redis = { ok: true, status: 'connected' };
      } else {
        throw new Error('Failed to get Redis client');
      }
    }
  } catch (e: any) {
    degraded = true; 
    checks.redis = { ok: false, error: String(e?.message || e) };
  }

  // Dynamo check
  try {
    await withTimeout(
      dynamo.send(new GetItemCommand({
        TableName: process.env.CASES_TABLE!,
        Key: { pk: { S: "canary" }, sk: { S: "health" } }
      })), 
      300
    );
    checks.dynamo = { ok: true };
  } catch (e: any) {
    degraded = true; 
    checks.dynamo = { ok: false, error: String(e?.message || e) };
  }

  return jsonResponse(200, {
    ok: true,
    degraded,
    checks,
    service: 'StripedShield',
    version: '2.0.1',
    ts: new Date().toISOString()
  }, {
    origin,
    headers: { 'Cache-Control': 'no-cache' }
  });
};
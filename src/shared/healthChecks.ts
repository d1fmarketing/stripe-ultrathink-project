import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { getRedisClient, isRedisReady } from "../cache/redisConnection";

const dynamo = new DynamoDBClient({});

const DEFAULT_TIMEOUT_MS = 350;

const withTimeout = async <T>(promise: Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]) as Promise<T>;
};

export interface ProbeChecks {
  redis: Record<string, unknown>;
  dynamo: Record<string, unknown>;
}

export interface ReadinessResult {
  degraded: boolean;
  checks: ProbeChecks;
}

export const runReadinessChecks = async (): Promise<ReadinessResult> => {
  const checks: ProbeChecks = { redis: {}, dynamo: {} };
  let degraded = false;

  try {
    if (isRedisReady()) {
      checks.redis = { ok: true, status: "ready" };
    } else {
      const redis = await withTimeout(getRedisClient(), 500);
      if (!redis) {
        throw new Error("Failed to get Redis client");
      }
      await withTimeout(redis.ping(), 250);
      checks.redis = { ok: true, status: "connected" };
    }
  } catch (err: any) {
    degraded = true;
    checks.redis = { ok: false, error: String(err?.message || err) };
  }

  try {
    await withTimeout(
      dynamo.send(new GetItemCommand({
        TableName: process.env.CASES_TABLE!,
        Key: { pk: { S: "canary" }, sk: { S: "health" } }
      })),
      300
    );
    checks.dynamo = { ok: true };
  } catch (err: any) {
    degraded = true;
    checks.dynamo = { ok: false, error: String(err?.message || err) };
  }

  return { degraded, checks };
};

export interface ProbeResponseBody {
  ok: boolean;
  degraded: boolean;
  checks?: ProbeChecks;
  service: string;
  version: string;
  ts: string;
  [key: string]: unknown;
}

export const buildProbeResponse = (
  result: ReadinessResult | null,
  overrides: Partial<ProbeResponseBody> = {}
) => {
  const base: ProbeResponseBody = {
    ok: result ? !result.degraded : true,
    degraded: result ? result.degraded : false,
    checks: result ? result.checks : undefined,
    service: "StripedShield",
    version: "2.0.1",
    ts: new Date().toISOString()
  };

  const body = { ...base, ...overrides };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify(body)
  };
};

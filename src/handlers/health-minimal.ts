import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { setCorrelationContext, withRequestLogging } from "../shared/logger.js";

// Minimal Redis check without heavy imports
async function checkRedis(): Promise<{ ok: boolean; error?: string }> {
  const net = require('net');
  const host = 'stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com';
  const port = 6379;
  
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ ok: false, error: 'Connection timeout' });
    }, 500);
    
    client.connect(port, host, () => {
      clearTimeout(timeout);
      client.write('PING\r\n');
    });
    
    client.on('data', (data) => {
      const response = data.toString();
      client.destroy();
      clearTimeout(timeout);
      if (response.includes('+PONG') || response.includes('PONG')) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: 'Invalid response' });
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message });
    });
  });
}

const dynamo = new DynamoDBClient({});

export const handler = withRequestLogging(async (_evt: any, ctx: any) => {
  if (ctx && typeof ctx === 'object') {
    ctx.callbackWaitsForEmptyEventLoop = false;
  }

  setCorrelationContext({ merchantId: 'system' });

  const checks: any = { redis: {}, dynamo: {} };
  let degraded = false;

  // Redis check - lightweight
  try {
    checks.redis = await checkRedis();
    if (!checks.redis.ok) degraded = true;
  } catch (e: any) {
    degraded = true;
    checks.redis = { ok: false, error: String(e?.message || e) };
  }

  // Dynamo check
  try {
    await dynamo.send(new GetItemCommand({
      TableName: process.env.CASES_TABLE || 'chargeback-autopilot-stripe-prod-CasesTable-1LPIUKCN82FYI',
      Key: { pk: { S: "canary" }, sk: { S: "health" } }
    }));
    checks.dynamo = { ok: true };
  } catch (e: any) {
    // DynamoDB is still ok even if item doesn't exist
    if (e.name === 'ResourceNotFoundException') {
      degraded = true;
      checks.dynamo = { ok: false, error: 'Table not found' };
    } else {
      checks.dynamo = { ok: true }; // Item not found is ok
    }
  }

  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      ok: !degraded,
      degraded,
      checks,
      service: 'StripedShield',
      version: '2.0.1',
      ts: new Date().toISOString()
    })
  };
});
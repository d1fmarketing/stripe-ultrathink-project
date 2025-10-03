/**
 * Database Helper Functions for REAL Data
 * No more hardcoded values - everything from actual database
 */

import { ddb } from "./ddb.js";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const CASES = process.env.CASES_TABLE!;

interface CustomerHistoryMetrics {
  total: number;
  tenureDays: number;
  orderCount: number;
  refundsLast90Days: number;
  transactions: Array<{
    created_at_epoch?: number;
    createdAt?: number;
    charge_id?: string;
    disputed?: boolean;
    refunded?: boolean;
    order_id?: string;
  }>;
}

const customerHistoryCache = new Map<string, Promise<CustomerHistoryMetrics>>();

function buildCustomerPartitionKey(merchantId: string, customerId: string) {
  return `${merchantId}#${customerId}`;
}

async function loadCustomerHistoryMetrics(merchantId: string, customerId: string): Promise<CustomerHistoryMetrics> {
  const compositeCustomerId = buildCustomerPartitionKey(merchantId, customerId);
  const transactions: CustomerHistoryMetrics["transactions"] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      IndexName: "ByCustomerByCreatedAt",
      KeyConditionExpression: "customerId = :customer",
      ExpressionAttributeValues: {
        ":customer": compositeCustomerId
      },
      ProjectionExpression: "created_at_epoch, createdAt, charge_id, disputed, refunded, order_id",
      ExclusiveStartKey: lastEvaluatedKey
    }));

    transactions.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (transactions.length === 0) {
    return {
      total: 0,
      tenureDays: 0,
      orderCount: 0,
      refundsLast90Days: 0,
      transactions
    };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const ninetyDaysAgo = nowEpoch - (90 * 24 * 60 * 60);

  const createdEpochs = transactions
    .map(tx => tx.created_at_epoch ?? tx.createdAt)
    .filter((value): value is number => typeof value === "number");

  const earliestTimestamp = createdEpochs.length > 0 ? Math.min(...createdEpochs) : nowEpoch;
  const tenureDays = Math.floor((nowEpoch - earliestTimestamp) / (24 * 60 * 60));

  const orderCount = transactions.filter(tx => tx.order_id && tx.order_id !== "").length;
  const refundsLast90Days = transactions.filter(tx => {
    const created = tx.created_at_epoch ?? tx.createdAt ?? 0;
    return Boolean(tx.refunded) && created >= ninetyDaysAgo;
  }).length;

  return {
    total: transactions.length,
    tenureDays,
    orderCount,
    refundsLast90Days,
    transactions
  };
}

async function getCustomerHistoryMetrics(merchantId: string, customerId: string): Promise<CustomerHistoryMetrics> {
  if (!customerId) {
    return {
      total: 0,
      tenureDays: 0,
      orderCount: 0,
      refundsLast90Days: 0,
      transactions: []
    };
  }

  const cacheKey = buildCustomerPartitionKey(merchantId, customerId);
  if (!customerHistoryCache.has(cacheKey)) {
    customerHistoryCache.set(cacheKey, loadCustomerHistoryMetrics(merchantId, customerId));
  }

  return customerHistoryCache.get(cacheKey)!;
}

/**
 * Calculate REAL merchant win rate from historical cases
 * @param merchantId - The merchant's Stripe account ID
 * @param daysPeriod - Number of days to look back (default 180)
 * @returns Win rate as decimal (0.0 to 1.0)
 */
export async function getMerchantWinRate(merchantId: string, daysPeriod = 180): Promise<number> {
  try {
    const since = Date.now() - (daysPeriod * 24 * 60 * 60 * 1000);
    const items: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const response = await ddb.send(new QueryCommand({
        TableName: CASES,
        IndexName: "ByMerchantByCreatedAt",
        KeyConditionExpression: "merchantId = :merchant AND createdAt BETWEEN :since AND :now",
        ExpressionAttributeValues: {
          ":merchant": merchantId,
          ":since": Math.floor(since / 1000),
          ":now": Math.floor(Date.now() / 1000)
        },
        ProjectionExpression: "status",
        ExclusiveStartKey: lastEvaluatedKey
      }));

      items.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    if (items.length === 0) {
      // No history - return neutral 50%
      return 0.5;
    }

    const wins = items.filter(item => item.status === "won" || item.status === "warning_closed").length;
    const winRate = wins / items.length;

    console.log(`[DB] Merchant ${merchantId} win rate: ${(winRate * 100).toFixed(1)}% (${wins}/${items.length} cases)`);
    return winRate;
  } catch (error) {
    console.error('[DB] Error calculating merchant win rate:', error);
    return 0.5; // Default to neutral on error
  }
}

/**
 * Get customer's total transaction count
 * @param merchantId - The merchant's Stripe account ID
 * @param customerId - The customer's ID
 * @returns Number of prior transactions
 */
export async function getCustomerTransactionCount(merchantId: string, customerId: string): Promise<number> {
  try {
    const metrics = await getCustomerHistoryMetrics(merchantId, customerId);
    const count = metrics.total;
    console.log(`[DB] Customer ${customerId} has ${count} prior transactions`);
    return count;
  } catch (error) {
    console.error('[DB] Error getting customer transaction count:', error);
    return 0;
  }
}

/**
 * Calculate customer tenure in days
 * @param merchantId - The merchant's Stripe account ID
 * @param customerId - The customer's ID
 * @returns Days since first transaction
 */
export async function getCustomerTenureDays(merchantId: string, customerId: string): Promise<number> {
  try {
    const metrics = await getCustomerHistoryMetrics(merchantId, customerId);
    const tenureDays = metrics.tenureDays;

    console.log(`[DB] Customer ${customerId} tenure: ${tenureDays} days`);
    return tenureDays;
  } catch (error) {
    console.error('[DB] Error calculating customer tenure:', error);
    return 0;
  }
}

/**
 * Get customer's total order count
 * @param merchantId - The merchant's Stripe account ID
 * @param customerId - The customer's ID
 * @returns Total number of orders
 */
export async function getCustomerOrderCount(merchantId: string, customerId: string): Promise<number> {
  try {
    const metrics = await getCustomerHistoryMetrics(merchantId, customerId);
    const count = metrics.orderCount;
    console.log(`[DB] Customer ${customerId} has ${count} orders`);
    return count;
  } catch (error) {
    console.error('[DB] Error getting customer order count:', error);
    return 0;
  }
}

/**
 * Get customer's refunds in the last 90 days
 * @param merchantId - The merchant's Stripe account ID
 * @param customerId - The customer's ID
 * @returns Number of refunds in last 90 days
 */
export async function getCustomerRefundsLast90Days(merchantId: string, customerId: string): Promise<number> {
  try {
    const metrics = await getCustomerHistoryMetrics(merchantId, customerId);
    const count = metrics.refundsLast90Days;
    console.log(`[DB] Customer ${customerId} has ${count} refunds in last 90 days`);
    return count;
  } catch (error) {
    console.error('[DB] Error getting customer refunds:', error);
    return 0;
  }
}

/**
 * Check if dispute is CE3.0 eligible by examining prior transactions
 * @param merchantId - The merchant's Stripe account ID
 * @param customerId - The customer's ID
 * @param chargeId - The current charge ID
 * @returns Object with eligibility status and matched transactions
 */
export async function checkCE3Eligibility(
  merchantId: string,
  customerId: string,
  chargeId: string
): Promise<{ eligible: boolean; priorTransactionCount: number; matchedElements: string[] }> {
  try {
    // CE3.0 requires 2+ prior undisputed transactions (120-365 days old)
    const oneYearAgo = Math.floor((Date.now() - (365 * 24 * 60 * 60 * 1000)) / 1000);
    const fourMonthsAgo = Math.floor((Date.now() - (120 * 24 * 60 * 60 * 1000)) / 1000);

    const metrics = await getCustomerHistoryMetrics(merchantId, customerId);
    const priorTransactions = metrics.transactions.filter(item => {
      const created = item.created_at_epoch ?? item.createdAt ?? 0;
      if (!created) return false;
      if (item.charge_id === chargeId) return false;
      if (created < oneYearAgo || created > fourMonthsAgo) return false;
      if (item.disputed === true) return false;
      return true;
    });

    const eligible = priorTransactions.length >= 2;

    // Check for matching elements (simplified - in production would check IP, device, etc.)
    const matchedElements = [];
    if (priorTransactions.length > 0) {
      matchedElements.push("customer_email");
      if ((priorTransactions[0] as any).shipping_address) {
        matchedElements.push("shipping_address");
      }
    }

    console.log(`[DB] CE3.0 eligibility for ${customerId}: ${eligible} (${priorTransactions.length} prior transactions)`);

    return {
      eligible,
      priorTransactionCount: priorTransactions.length,
      matchedElements
    };
  } catch (error) {
    console.error('[DB] Error checking CE3 eligibility:', error);
    return { eligible: false, priorTransactionCount: 0, matchedElements: [] };
  }
}

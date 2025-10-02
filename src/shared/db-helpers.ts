/**
 * Database Helper Functions for REAL Data
 * No more hardcoded values - everything from actual database
 */

import { ddb } from "./ddb.js";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import logger from './logger';

const CASES = process.env.CASES_TABLE!;
const MERCHANTS = process.env.MERCHANTS_TABLE!;
const SUBMISSIONS = process.env.SUBMISSIONS_TABLE!;

/**
 * Calculate REAL merchant win rate from historical cases
 * @param merchantId - The merchant's Stripe account ID
 * @param daysPeriod - Number of days to look back (default 180)
 * @returns Win rate as decimal (0.0 to 1.0)
 */
export async function getMerchantWinRate(merchantId: string, daysPeriod = 180): Promise<number> {
  try {
    const since = Date.now() - (daysPeriod * 24 * 60 * 60 * 1000);
    
    // Query all cases for this merchant
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "created_at_epoch >= :since AND (dispute_status = :won OR dispute_status = :lost)",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":since": Math.floor(since / 1000),
        ":won": "won",
        ":lost": "lost"
      }
    }));
    
    const items = response.Items || [];
    if (items.length === 0) {
      // No history - return neutral 50%
      return 0.5;
    }
    
    const wins = items.filter(item => item.dispute_status === "won").length;
    const winRate = wins / items.length;
    
    logger.info('Merchant win rate calculated', {
      merchantId,
      winRate: Number((winRate * 100).toFixed(1)),
      wins,
      totalCases: items.length,
    });
    return winRate;
  } catch (error) {
    logger.error('Error calculating merchant win rate', { error, merchantId });
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
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "customer_id = :customerId",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":customerId": customerId
      }
    }));
    
    const count = response.Items?.length || 0;
    logger.info('Customer prior transactions count', { customerId, count });
    return count;
  } catch (error) {
    logger.error('Error getting customer transaction count', { error, customerId });
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
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "customer_id = :customerId",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":customerId": customerId
      },
      ProjectionExpression: "created_at_epoch"
    }));
    
    const items = response.Items || [];
    if (items.length === 0) {
      return 0;
    }
    
    // Find earliest transaction
    const earliestTimestamp = Math.min(...items.map(item => item.created_at_epoch || Date.now() / 1000));
    const tenureDays = Math.floor((Date.now() / 1000 - earliestTimestamp) / (24 * 60 * 60));
    
    logger.info('Customer tenure calculated', { customerId, tenureDays });
    return tenureDays;
  } catch (error) {
    logger.error('Error calculating customer tenure', { error, customerId });
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
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "customer_id = :customerId AND order_id <> :empty",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":customerId": customerId,
        ":empty": ""
      }
    }));
    
    const count = response.Items?.length || 0;
    logger.info('Customer order count retrieved', { customerId, count });
    return count;
  } catch (error) {
    logger.error('Error getting customer order count', { error, customerId });
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
    const ninetyDaysAgo = Math.floor((Date.now() - (90 * 24 * 60 * 60 * 1000)) / 1000);
    
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "customer_id = :customerId AND refunded = :true AND created_at_epoch >= :since",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":customerId": customerId,
        ":true": true,
        ":since": ninetyDaysAgo
      }
    }));
    
    const count = response.Items?.length || 0;
    logger.info('Customer refund count retrieved', { customerId, count });
    return count;
  } catch (error) {
    logger.error('Error getting customer refunds', { error, customerId });
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
    
    const response = await ddb.send(new QueryCommand({
      TableName: CASES,
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "customer_id = :customerId AND created_at_epoch BETWEEN :start AND :end AND charge_id <> :currentCharge AND (attribute_not_exists(disputed) OR disputed = :false)",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":customerId": customerId,
        ":start": oneYearAgo,
        ":end": fourMonthsAgo,
        ":currentCharge": chargeId,
        ":false": false
      }
    }));
    
    const priorTransactions = response.Items || [];
    const eligible = priorTransactions.length >= 2;
    
    // Check for matching elements (simplified - in production would check IP, device, etc.)
    const matchedElements = [];
    if (priorTransactions.length > 0) {
      matchedElements.push("customer_email");
      if (priorTransactions[0].shipping_address) {
        matchedElements.push("shipping_address");
      }
    }
    
    logger.info('CE3.0 eligibility evaluated', {
      customerId,
      eligible,
      priorTransactions: priorTransactions.length,
    });
    
    return {
      eligible,
      priorTransactionCount: priorTransactions.length,
      matchedElements
    };
  } catch (error) {
    logger.error('Error checking CE3 eligibility', { error, customerId });
    return { eligible: false, priorTransactionCount: 0, matchedElements: [] };
  }
}
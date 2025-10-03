import Stripe from 'stripe';
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/ddb.js';

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });
const CASES_TABLE = process.env.CASES_TABLE!;

interface CaseItem {
  pk: string;
  sk: string;
  charge_id?: string | null;
  payment_intent_id?: string | null;
  customer_id?: string | null;
  [key: string]: any;
}

async function fetchCustomerId(item: CaseItem): Promise<string | null> {
  if (item.customer_id) {
    return item.customer_id;
  }

  let requestOptions: Stripe.RequestOptions | undefined;
  if (item.pk?.startsWith('MERCHANT#')) {
    const merchantId = item.pk.replace('MERCHANT#', '');
    if (merchantId.startsWith('acct_')) {
      requestOptions = { stripeAccount: merchantId };
    }
  }

  if (item.charge_id) {
    try {
      const charge = await stripe.charges.retrieve(item.charge_id, undefined, requestOptions);
      const chargeCustomer = charge.customer as Stripe.Customer | string | null | undefined;
      if (typeof chargeCustomer === 'string') {
        return chargeCustomer;
      }
      if (chargeCustomer) {
        return chargeCustomer.id;
      }
      if (typeof charge.payment_intent === 'string') {
        const pi = await stripe.paymentIntents.retrieve(charge.payment_intent, undefined, requestOptions);
        const piCustomer = pi.customer as Stripe.Customer | string | null | undefined;
        if (typeof piCustomer === 'string') {
          return piCustomer;
        }
        if (piCustomer) {
          return piCustomer.id;
        }
      }
    } catch (error) {
      console.error(`Failed to retrieve charge ${item.charge_id}:`, error);
    }
  }

  if (item.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(item.payment_intent_id, undefined, requestOptions);
      const piCustomer = pi.customer as Stripe.Customer | string | null | undefined;
      if (typeof piCustomer === 'string') {
        return piCustomer;
      }
      if (piCustomer) {
        return piCustomer.id;
      }
      if (typeof pi.latest_charge === 'string') {
        try {
          const charge = await stripe.charges.retrieve(pi.latest_charge, undefined, requestOptions);
          const chargeCustomer = charge.customer as Stripe.Customer | string | null | undefined;
          if (typeof chargeCustomer === 'string') {
            return chargeCustomer;
          }
          if (chargeCustomer) {
            return chargeCustomer.id;
          }
        } catch (error) {
          console.error(`Failed to retrieve latest charge ${pi.latest_charge} for payment intent ${pi.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to retrieve payment intent ${item.payment_intent_id}:`, error);
    }
  }

  return null;
}

async function backfillBatch(items: CaseItem[]) {
  for (const item of items) {
    const customerId = await fetchCustomerId(item);
    if (!customerId) {
      continue;
    }

    if (item.customer_id === customerId) {
      continue;
    }

    const updatedItem = { ...item, customer_id: customerId };
    await ddb.send(new PutCommand({
      TableName: CASES_TABLE,
      Item: updatedItem
    }));
    console.log(`Backfilled customer ${customerId} for ${item.pk}#${item.sk}`);
  }
}

export async function backfillCustomerIds() {
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const response = await ddb.send(new ScanCommand({
      TableName: CASES_TABLE,
      ExclusiveStartKey,
      FilterExpression: 'attribute_not_exists(customer_id) OR customer_id = :empty',
      ExpressionAttributeValues: {
        ':empty': null
      }
    }));

    const items = (response.Items as CaseItem[] | undefined) || [];
    if (items.length > 0) {
      await backfillBatch(items);
    }

    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

if (require.main === module) {
  backfillCustomerIds()
    .then(() => {
      console.log('Customer ID backfill complete');
    })
    .catch((error) => {
      console.error('Customer ID backfill failed', error);
      process.exitCode = 1;
    });
}

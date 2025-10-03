import Stripe from 'stripe';
import { CustomerHistory } from '../customerHistory';

describe('CustomerHistory generateEstimatedHistory', () => {
  const fakeStripe = {
    customers: { retrieve: jest.fn() },
    charges: { list: jest.fn(), retrieve: jest.fn() },
    paymentMethods: { list: jest.fn() },
    disputes: { list: jest.fn() }
  } as unknown as Stripe;

  const baseDispute = {
    id: 'dp_test',
    object: 'dispute',
    amount: 7500,
    charge: 'ch_test',
    created: 1_704_067_200,
    currency: 'usd',
    evidence: {} as Stripe.Dispute.Evidence,
    evidence_details: {
      due_by: null,
      has_evidence: false,
      past_due: false,
      submission_count: 0
    },
    livemode: false,
    metadata: {},
    reason: 'fraudulent',
    status: 'needs_response',
    is_charge_refundable: false
  } as unknown as Stripe.Dispute;

  const baseCharge = {
    id: 'ch_test',
    object: 'charge',
    amount: 7500,
    created: 1_703_280_000,
    currency: 'usd',
    payment_method_details: {
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        country: 'US',
        exp_month: 12,
        exp_year: 2030
      }
    },
    shipping: {
      address: {
        line1: '123 Market St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US'
      }
    }
  } as unknown as Stripe.Charge;

  it('returns identical estimated history for repeated invocations', () => {
    const customerHistory = new CustomerHistory(fakeStripe);

    const first = (customerHistory as any).generateEstimatedHistory(baseDispute, baseCharge);
    const second = (customerHistory as any).generateEstimatedHistory(baseDispute, baseCharge);

    expect(second).toEqual(first);
  });
});

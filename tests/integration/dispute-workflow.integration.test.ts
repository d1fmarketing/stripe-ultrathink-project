import Stripe from 'stripe';
import { EvidenceBundler } from '../../src/ce3-engine/evidenceBundler';
import { CE3Detector } from '../../src/ce3-engine/ce3Detector';

type MockStripe = {
  charges: {
    retrieve: jest.Mock<Promise<Stripe.Charge>, [string, any?]>;
    list: jest.Mock<Promise<{ data: Stripe.Charge[] }>, [Stripe.ChargeListParams, any?]>;
  };
  disputes: {
    update: jest.Mock;
  };
};

const BASE_ADDRESS = {
  line1: '123 Market St',
  city: 'San Francisco',
  state: 'CA',
  postal_code: '94105',
  country: 'US'
};

const createDispute = (overrides: Partial<Stripe.Dispute>): Stripe.Dispute => ({
  id: 'dp_test',
  object: 'dispute',
  amount: 7500,
  currency: 'usd',
  status: 'warning_needs_response',
  reason: 'fraudulent',
  charge: 'ch_test',
  payment_intent: 'pi_test',
  created: Math.floor(Date.now() / 1000),
  evidence: {},
  evidence_details: {
    due_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    has_evidence: false,
    past_due: false,
    submission_count: 0
  },
  is_charge_refundable: true,
  livemode: false,
  metadata: {},
  ...overrides
} as Stripe.Dispute);

interface ChargeOptions {
  id: string;
  customer: string;
  created: number;
  amount?: number;
  metadata?: Record<string, string>;
  shipping?: Partial<Stripe.Charge.Shipping>;
  billingEmail?: string;
  status?: Stripe.Charge.Status;
}

const createCharge = ({
  id,
  customer,
  created,
  amount = 7500,
  metadata = {},
  shipping,
  billingEmail = 'customer@example.com',
  status = 'succeeded'
}: ChargeOptions): Stripe.Charge => ({
  id,
  object: 'charge',
  amount,
  amount_captured: amount,
  amount_refunded: 0,
  application: null,
  application_fee: null,
  application_fee_amount: null,
  balance_transaction: 'txn_test',
  billing_details: {
    address: BASE_ADDRESS,
    email: billingEmail,
    name: 'Jane Doe',
    phone: null
  },
  calculated_statement_descriptor: 'TESTMERCHANT',
  captured: true,
  created,
  currency: 'usd',
  customer,
  description: 'Test purchase',
  disputed: false,
  livemode: false,
  metadata,
  payment_intent: 'pi_test',
  payment_method_details: {
    type: 'card',
    card: {
      brand: 'visa',
      checks: {
        address_line1_check: 'pass',
        address_postal_code_check: 'pass',
        cvc_check: 'pass'
      },
      country: 'US',
      exp_month: 12,
      exp_year: new Date().getFullYear() + 1,
      fingerprint: 'fp_test',
      funding: 'credit',
      installments: null,
      last4: '4242',
      network: 'visa',
      three_d_secure: { authenticated: true } as any,
      wallet: null
    }
  } as any,
  receipt_email: billingEmail,
  receipt_number: null,
  receipt_url: 'https://example.com/receipt',
  refunded: false,
  refunds: {
    object: 'list',
    data: [],
    has_more: false,
    total_count: 0,
    url: `/v1/charges/${id}/refunds`
  },
  outcome: {
    network_status: 'approved_by_network',
    reason: null,
    risk_level: 'normal',
    seller_message: 'Payment complete.',
    type: 'authorized',
    risk_score: 12
  },
  shipping: {
    address: BASE_ADDRESS,
    carrier: shipping?.carrier ?? 'standard',
    name: 'Jane Doe',
    phone: null,
    tracking_number: shipping?.tracking_number ?? null
  },
  source: null,
  statement_descriptor: null,
  statement_descriptor_suffix: null,
  status,
  transfer_data: null,
  transfer_group: null,
  balance_transaction_details: undefined,
  fraud_details: {},
  payment_method: 'pm_test',
  outcome_type: undefined,
  on_behalf_of: null,
  review: null,
  disputes: undefined,
  invoice: null,
  disputed_payment_intent: undefined,
  billing_reason: null,
  application_fee_details: [],
  refunds_data: undefined,
  radar_options: undefined,
  metadata_details: undefined,
  disputes_count: undefined
} as unknown as Stripe.Charge);

const createMockStripe = (
  disputeCharge: Stripe.Charge,
  priorCharges: Stripe.Charge[]
): MockStripe => ({
  charges: {
    retrieve: jest.fn().mockResolvedValue(disputeCharge),
    list: jest.fn().mockImplementation(async (params: Stripe.ChargeListParams) => {
      if (params.customer !== disputeCharge.customer) {
        return { data: [] };
      }
      return { data: priorCharges };
    })
  },
  disputes: {
    update: jest.fn()
  }
});

describe('Critical dispute workflow integration', () => {
  it('assembles a CE3-ready evidence package when prior transactions qualify', async () => {
    const now = Math.floor(Date.now() / 1000);
    const dispute = createDispute({
      id: 'dp_ce3',
      charge: 'ch_ce3',
      created: now,
      reason: 'fraudulent'
    });

    const disputeCharge = createCharge({
      id: 'ch_ce3',
      customer: 'cus_ce3',
      created: now - 2 * 24 * 60 * 60,
      metadata: {
        ip_address: '203.0.113.1',
        device_id: 'device-123',
        invoice_url: 'https://example.com/invoice.pdf'
      },
      shipping: {
        carrier: 'ups',
        tracking_number: '1Z999'
      }
    });

    const priorCharge1 = createCharge({
      id: 'ch_prior_1',
      customer: 'cus_ce3',
      created: now - 150 * 24 * 60 * 60,
      metadata: {
        ip_address: '203.0.113.1',
        device_id: 'device-123'
      }
    });

    const priorCharge2 = createCharge({
      id: 'ch_prior_2',
      customer: 'cus_ce3',
      created: now - 200 * 24 * 60 * 60,
      metadata: {
        ip_address: '203.0.113.1',
        device_id: 'device-123'
      }
    });

    const mockStripe = createMockStripe(disputeCharge, [priorCharge1, priorCharge2]);

    const bundler = new EvidenceBundler('sk_test');
    const ce3Detector = new CE3Detector('sk_test');

    (bundler as any).stripe = mockStripe;
    (ce3Detector as any).stripe = mockStripe;
    (bundler as any).ce3Detector = ce3Detector;

    const result = await bundler.assembleEvidencePackage(dispute, 'acct_merchant', 'acct_connect');

    expect(result.ce3Eligible).toBe(true);
    expect(result.winProbability).toBeCloseTo(0.95, 5);
    expect(result.narrative).toContain('Compelling Evidence 3.0');
    expect(result.evidence.customer_communication).toContain('CE3.0 Evidence');
    expect(result.supportingDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'policy',
          description: expect.stringContaining('Terms of Service')
        })
      ])
    );
    expect(result.submissionReady).toBe(true);
  });

  it('assembles a comprehensive package for product-not-received disputes without CE3 support', async () => {
    const now = Math.floor(Date.now() / 1000);
    const dispute = createDispute({
      id: 'dp_pnr',
      charge: 'ch_pnr',
      created: now,
      reason: 'product_not_received'
    });

    const disputeCharge = createCharge({
      id: 'ch_pnr',
      customer: 'cus_pnr',
      created: now - 5 * 24 * 60 * 60,
      metadata: {
        invoice_url: 'https://example.com/invoice.pdf'
      },
      shipping: {
        carrier: 'priority',
        tracking_number: null
      }
    });

    const mockStripe = createMockStripe(disputeCharge, []);

    const bundler = new EvidenceBundler('sk_test');
    const ce3Detector = new CE3Detector('sk_test');

    (bundler as any).stripe = mockStripe;
    (ce3Detector as any).stripe = mockStripe;
    (bundler as any).ce3Detector = ce3Detector;

    const result = await bundler.assembleEvidencePackage(dispute, 'acct_merchant', 'acct_connect');

    expect(result.ce3Eligible).toBe(false);
    expect(result.winProbability).toBeCloseTo(0.56, 2);
    expect(result.narrative).toContain('package should have arrived within 3-5 business days');
    expect(result.submissionReady).toBe(true);
    expect(result.estimatedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'shipping_date', confidence: 'medium' })
      ])
    );
    expect(result.supportingDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'policy',
          description: expect.stringContaining('Terms of Service')
        })
      ])
    );
  });
});

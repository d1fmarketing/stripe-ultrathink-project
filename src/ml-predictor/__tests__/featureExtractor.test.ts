import { FeatureExtractor } from '../featureExtractor';
import type Stripe from 'stripe';

jest.mock('../../shared/ddb', () => ({
  ddb: {
    send: jest.fn()
  }
}));

const { ddb } = jest.requireMock('../../shared/ddb') as { ddb: { send: jest.Mock } };

describe('FeatureExtractor merchant feature lookup', () => {
  const disputeBase = {
    id: 'dp_test',
    object: 'dispute'
  } as Stripe.Dispute;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MERCHANT_SUMMARY_TABLE = 'MerchantSummary';
  });

  it('fetches merchant metrics from DynamoDB and caches them', async () => {
    const dispute = { ...disputeBase, account: 'acct_test_123' } as Stripe.Dispute;
    const extractor = new FeatureExtractor('sk_test');

    ddb.send.mockResolvedValueOnce({
      Item: {
        pk: 'MERCHANT#acct_test_123',
        merchant_category: 'software',
        merchant_country: 'CA',
        average_ticket_size: 12000,
        monthly_volume: 250000,
        dispute_rate: 0.015,
        win_rate: 0.62,
        average_response_time: 36
      }
    });

    const features = await (extractor as any).extractMerchantFeatures(dispute);

    expect(features).toMatchObject({
      merchantId: 'acct_test_123',
      merchantCategory: 'software',
      merchantCountry: 'CA',
      averageTicketSize: 12000,
      monthlyVolume: 250000,
      disputeRate: 0.015,
      winRate: 0.62,
      averageResponseTime: 36
    });

    expect(ddb.send).toHaveBeenCalledTimes(1);

    ddb.send.mockClear();
    const cached = await (extractor as any).extractMerchantFeatures(dispute);
    expect(cached).toEqual(features);
    expect(ddb.send).not.toHaveBeenCalled();
  });

  it('falls back to defaults when lookup fails and caches the fallback', async () => {
    const dispute = { ...disputeBase, account: 'acct_missing' } as Stripe.Dispute;
    const extractor = new FeatureExtractor('sk_test');

    ddb.send.mockRejectedValueOnce(new Error('boom'));

    const features = await (extractor as any).extractMerchantFeatures(dispute);

    expect(features).toMatchObject({
      merchantId: 'acct_missing',
      merchantCategory: 'general',
      merchantCountry: 'US',
      averageTicketSize: 5000,
      monthlyVolume: 100000,
      disputeRate: 0.01,
      winRate: 0.45,
      averageResponseTime: 72
    });

    expect(ddb.send).toHaveBeenCalledTimes(1);

    ddb.send.mockClear();
    const cached = await (extractor as any).extractMerchantFeatures(dispute);
    expect(cached).toEqual(features);
    expect(ddb.send).not.toHaveBeenCalled();
  });
});

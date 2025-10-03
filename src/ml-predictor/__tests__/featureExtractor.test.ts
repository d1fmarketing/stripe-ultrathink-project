import { FeatureExtractor } from '../featureExtractor';

const chargesRetrieveMock = jest.fn();
const paymentIntentsRetrieveMock = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    charges: { retrieve: chargesRetrieveMock },
    paymentIntents: { retrieve: paymentIntentsRetrieveMock },
  }));
});

describe('FeatureExtractor Connect support', () => {
  beforeEach(() => {
    chargesRetrieveMock.mockReset().mockResolvedValue({ id: 'ch_123' });
    paymentIntentsRetrieveMock.mockReset().mockResolvedValue({ id: 'pi_123' });
  });

  it('forwards stripeAccount when provided', async () => {
    const extractor = new FeatureExtractor('sk_test', 'acct_123');

    const charge = await (extractor as any).getCharge('ch_123');
    expect(charge).toEqual({ id: 'ch_123' });
    expect(chargesRetrieveMock).toHaveBeenCalledWith('ch_123', undefined, { stripeAccount: 'acct_123' });

    const paymentIntent = await (extractor as any).getPaymentIntent('pi_123');
    expect(paymentIntent).toEqual({ id: 'pi_123' });
    expect(paymentIntentsRetrieveMock).toHaveBeenCalledWith('pi_123', undefined, { stripeAccount: 'acct_123' });
  });

  it('omits stripeAccount when not provided', async () => {
    const extractor = new FeatureExtractor('sk_test');

    await (extractor as any).getCharge('ch_456');
    expect(chargesRetrieveMock).toHaveBeenCalledWith('ch_456');

    await (extractor as any).getPaymentIntent('pi_456');
    expect(paymentIntentsRetrieveMock).toHaveBeenCalledWith('pi_456');
  });
});

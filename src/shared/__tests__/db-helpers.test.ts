const sendMock = jest.fn();
const capturedInputs: any[] = [];

jest.mock('../ddb.js', () => ({
  ddb: { send: sendMock }
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  QueryCommand: class {
    public readonly input: any;
    constructor(input: any) {
      this.input = input;
      capturedInputs.push(input);
    }
  },
  ScanCommand: class {}
}));

import { getMerchantWinRate } from '../db-helpers';

describe('getMerchantWinRate', () => {
  beforeEach(() => {
    sendMock.mockReset();
    capturedInputs.length = 0;
  });

  it('uses status field in query and win calculations', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { status: 'won' },
        { status: 'lost' },
        { status: 'won' }
      ]
    });

    const winRate = await getMerchantWinRate('acct_123', 30);

    expect(winRate).toBeCloseTo(2 / 3, 5);
    expect(capturedInputs).toHaveLength(1);
    const input = capturedInputs[0];
    expect(input.FilterExpression).toContain('#status = :won');
    expect(input.FilterExpression).not.toContain('dispute_status');
    expect(input.ExpressionAttributeNames).toEqual(
      expect.objectContaining({ '#status': 'status' })
    );
    expect(input.ProjectionExpression).toContain('#status');
  });

  it('returns neutral win rate when no history is found', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const winRate = await getMerchantWinRate('acct_456');

    expect(winRate).toBe(0.5);
  });
});

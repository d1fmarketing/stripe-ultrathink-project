import { QueryCommand } from '@aws-sdk/lib-dynamodb';

jest.mock('./ddb.js', () => ({
  ddb: { send: jest.fn() }
}));

describe('getMerchantWinRate', () => {
  const sendMock = (jest.requireMock('./ddb.js') as { ddb: { send: jest.Mock } }).ddb.send as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CASES_TABLE = 'CasesTable';
    process.env.MERCHANTS_TABLE = 'MerchantsTable';
    process.env.SUBMISSIONS_TABLE = 'SubmissionsTable';
  });

  afterEach(() => {
    delete process.env.CASES_TABLE;
    delete process.env.MERCHANTS_TABLE;
    delete process.env.SUBMISSIONS_TABLE;
  });

  it('counts disputes using the status attribute and projects only required fields', async () => {
    const now = Math.floor(Date.now() / 1000);
    sendMock.mockResolvedValue({
      Items: [
        { status: 'won', created_at_epoch: now },
        { status: 'lost', created_at_epoch: now }
      ]
    });

    let winRate: number | undefined;
    await jest.isolateModulesAsync(async () => {
      const module = await import('./db-helpers.js');
      winRate = await module.getMerchantWinRate('acct_123', 30);
    });

    expect(winRate).toBe(0.5);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0][0] as QueryCommand;
    const input = command.input;

    expect(input.FilterExpression).toContain('#status = :won');
    expect(input.FilterExpression).toContain('#status = :lost');
    expect(input.ExpressionAttributeNames?.['#status']).toBe('status');
    expect(input.ExpressionAttributeNames?.['#createdAt']).toBe('created_at_epoch');
    expect(input.ProjectionExpression).toBe('#status, #createdAt');
  });
});

import { checkRateLimit } from '../rateLimit.js';
import { ddb } from '../ddb.js';

jest.mock('../ddb.js', () => ({
  ddb: { send: jest.fn() }
}));

const sendMock = ddb.send as jest.MockedFunction<typeof ddb.send>;

describe('checkRateLimit', () => {
  const fixedNowMs = 1_700_000_000_000;
  const nowSeconds = Math.floor(fixedNowMs / 1000);
  const config = {
    maxRequests: 3,
    windowSeconds: 60,
    identifier: 'test-user'
  };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNowMs);
    sendMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('limits requests within the same window', async () => {
    const expectedWindowStart = Math.floor(nowSeconds / config.windowSeconds) * config.windowSeconds;

    let attempts = 0;
    sendMock.mockImplementation(async () => {
      attempts += 1;
      if (attempts > config.maxRequests) {
        const error = new Error('ConditionalCheckFailedException');
        (error as any).name = 'ConditionalCheckFailedException';
        throw error;
      }

      return { Attributes: { count: attempts } };
    });

    for (let i = 0; i < config.maxRequests; i += 1) {
      await expect(checkRateLimit(config)).resolves.toBe(true);
    }

    await expect(checkRateLimit(config)).resolves.toBe(false);

    expect(sendMock).toHaveBeenCalledTimes(config.maxRequests + 1);
    const firstCall = sendMock.mock.calls[0][0] as { input: Record<string, any> };
    expect(firstCall.input.Key.sk).toBe(`WINDOW#${expectedWindowStart}`);
    expect(firstCall.input.ExpressionAttributeValues[':ttl']).toBe(expectedWindowStart + config.windowSeconds);
  });
});

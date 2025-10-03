import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkRateLimit } from '../rateLimit.js';

jest.mock('../ddb.js', () => ({
  ddb: { send: jest.fn() }
}));

import { ddb } from '../ddb.js';

describe('checkRateLimit', () => {
  const sendMock = ddb.send as jest.Mock;
  const fixedNow = 1_700_000_000; // seconds
  const windowSeconds = 60;
  const bucketStart = Math.floor(fixedNow / windowSeconds) * windowSeconds;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    sendMock.mockReset();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow * 1000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('increments the counter within a stable window bucket', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { count: 1 } });

    const allowed = await checkRateLimit({
      identifier: 'user:123',
      maxRequests: 5,
      windowSeconds
    });

    expect(allowed).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateCommand);

    const input = (command as UpdateCommand).input;
    expect(input.Key).toEqual({
      pk: 'RATELIMIT#user:123',
      sk: `WINDOW#${bucketStart}`
    });
    expect(input.ExpressionAttributeValues[':ttl']).toBe(bucketStart + windowSeconds + 60);
    expect(input.UpdateExpression).toContain('if_not_exists');
    expect(input.ConditionExpression).toContain('count < :maxRequests');
  });

  it('returns false when the limit has been exceeded', async () => {
    const error = Object.assign(new Error('limit reached'), {
      name: 'ConditionalCheckFailedException'
    });
    sendMock.mockRejectedValueOnce(error);

    const allowed = await checkRateLimit({
      identifier: 'user:123',
      maxRequests: 5,
      windowSeconds
    });

    expect(allowed).toBe(false);
  });

  it('allows traffic on unexpected DynamoDB errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new Error('network issue'));

    const allowed = await checkRateLimit({
      identifier: 'user:123',
      maxRequests: 5,
      windowSeconds
    });

    expect(allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

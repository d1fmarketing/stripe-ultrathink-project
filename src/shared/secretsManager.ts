import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const SECRET_CACHE_TTL_MS = 60_000;

interface SecretCacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, SecretCacheEntry>();
const inflightFetches = new Map<string, Promise<string>>();

function resolveSecretId(secretName: string): string {
  const override = process.env[`${secretName}_SECRET_ID`];
  if (override) {
    return override;
  }

  const prefix = process.env.SECRETS_MANAGER_PREFIX;
  if (prefix) {
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    if (secretName.startsWith(normalizedPrefix)) {
      return secretName;
    }
    return `${normalizedPrefix}/${secretName}`;
  }

  return secretName;
}

async function fetchSecret(secretId: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = inflightFetches.get(secretId);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
    try {
      const response = await secretsClient.send(new GetSecretValueCommand({
        SecretId: secretId
      }));

      const secretString = response.SecretString ?? (response.SecretBinary ? Buffer.from(response.SecretBinary).toString('utf-8') : undefined);
      if (secretString === undefined) {
        throw new Error(`Secret ${secretId} has no retrievable value`);
      }

      cache.set(secretId, {
        value: secretString,
        expiresAt: Date.now() + SECRET_CACHE_TTL_MS
      });

      return secretString;
    } finally {
      inflightFetches.delete(secretId);
    }
  })();

  inflightFetches.set(secretId, fetchPromise);
  return fetchPromise;
}

export async function getSecretValue(secretName: string): Promise<string> {
  const secretId = resolveSecretId(secretName);
  return fetchSecret(secretId);
}

export async function getOptionalSecretValue(secretName: string): Promise<string | undefined> {
  try {
    const value = await getSecretValue(secretName);
    if (!value) {
      return undefined;
    }
    return value;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'ResourceNotFoundException') {
      return undefined;
    }
    throw error;
  }
}

export async function getJsonSecret<T>(secretName: string): Promise<T> {
  const secretValue = await getSecretValue(secretName);
  try {
    return JSON.parse(secretValue) as T;
  } catch (error) {
    throw new Error(`Secret ${secretName} is not valid JSON`);
  }
}

export function clearSecretCache(secretName?: string): void {
  if (secretName) {
    const secretId = resolveSecretId(secretName);
    cache.delete(secretId);
    inflightFetches.delete(secretId);
  } else {
    cache.clear();
    inflightFetches.clear();
  }
}

export { SECRET_CACHE_TTL_MS };

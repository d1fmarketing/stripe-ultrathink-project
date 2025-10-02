import OpenAI from 'openai';
import { getSecretValue, SECRET_CACHE_TTL_MS } from './secretsManager';

type OpenAICacheEntry = {
  client: OpenAI;
  apiKey: string;
  expiresAt: number;
};

let cachedOpenAI: OpenAICacheEntry | null = null;

export async function getOpenAIClient(): Promise<OpenAI | null> {
  try {
    const apiKey = (await getSecretValue('OPENAI_API_KEY')).trim();
    if (!apiKey) {
      console.warn('[openaiClient] OPENAI_API_KEY secret is empty');
      return null;
    }

    const now = Date.now();
    if (cachedOpenAI && cachedOpenAI.apiKey === apiKey && cachedOpenAI.expiresAt > now) {
      return cachedOpenAI.client;
    }

    const client = new OpenAI({ apiKey });
    cachedOpenAI = {
      client,
      apiKey,
      expiresAt: now + SECRET_CACHE_TTL_MS
    };

    return client;
  } catch (error) {
    console.error('[openaiClient] Failed to load OpenAI API key from Secrets Manager', error);
    return null;
  }
}

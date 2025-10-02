import Stripe from 'stripe';
import { getSecretValue, SECRET_CACHE_TTL_MS } from './secretsManager';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-07-30.basil';

type StripeCacheEntry = {
  client: Stripe;
  secret: string;
  expiresAt: number;
};

let cachedStripe: StripeCacheEntry | null = null;

export async function getStripeClient(): Promise<Stripe> {
  const secret = (await getSecretValue('STRIPE_SECRET')).trim();
  if (!secret) {
    throw new Error('Stripe secret is empty');
  }

  const now = Date.now();
  if (cachedStripe && cachedStripe.secret === secret && cachedStripe.expiresAt > now) {
    return cachedStripe.client;
  }

  const client = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
  cachedStripe = {
    client,
    secret,
    expiresAt: now + SECRET_CACHE_TTL_MS
  };

  return client;
}

export async function getStripeSecret(): Promise<string> {
  const secret = (await getSecretValue('STRIPE_SECRET')).trim();
  if (!secret) {
    throw new Error('Stripe secret is empty');
  }
  return secret;
}

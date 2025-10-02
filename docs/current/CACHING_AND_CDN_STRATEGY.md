# Caching and CDN Strategy

This document captures the production-ready caching posture for StripedShield after the Tier-1 performance optimization work.

## Backend API caching

We now use a tiered caching helper (`src/shared/cacheStrategy.ts`) that coordinates:

- **Hot in-memory cache** for single Lambda invocation reuse.
- **Redis (ElastiCache) cache** for cross-invocation reuse and fleet-wide sharing.
- **Stale-while-revalidate** behaviour so hot responses never block on database round-trips.

### Key defaults

| Layer | TTL | Notes |
| --- | --- | --- |
| Memory | 30 seconds | Keeps burst traffic fully warm inside each Lambda container. |
| Redis | 90-300 seconds | Configurable per endpoint. Keeps Redis reasonably fresh without thrashing. |
| Stale window | 60-120 seconds | Serves slightly outdated responses while background refresh runs. |

### Cache keys and invalidation

- Cache keys are generated with `cachingStrategy.buildKey(namespace, ...parts)` to guarantee consistent delimiting.
- Each entry can be tagged (for example `merchant:{id}` and `cases`) to enable selective invalidation.
- `cachingStrategy.invalidate(key)` clears a specific response; `invalidateTag(tag)` clears an entire cohort.

### Endpoint coverage

- **`listCases`** (`src/handlers/listCases.ts`)
  - Memory TTL: 30s; Redis TTL: 90s; stale window: 60s.
  - Tagged by merchant so a single merchant refresh does not flush other tenants.
- **`statsHandler`** (`src/handlers/statsHandler.ts`)
  - Memory TTL: 60s; Redis TTL: 300s; stale window: 120s.
  - Tagged as `stats` for global invalidation.
  - Response metadata preserves `dataSource` so dashboards can highlight cache hits.

## CDN and edge caching

### Netlify CDN headers

`netlify.toml` now defines long-lived caching for immutable assets and short TTLs for HTML/API responses:

- `/assets/*`, `/images/*`, `/fonts/*` → `Cache-Control: public, max-age=31536000, immutable`.
- `/api/*` → `Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300` for edge cache friendliness.
- Default (`/*`) → `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=600` to keep the landing page warm globally.

### Next.js edge headers

`frontend/next.config.js` mirrors the CDN strategy so builds pushed outside Netlify keep the same caching semantics:

- Global routes receive a 5-minute TTL with 10-minute surrogate control and stale-while-revalidate.
- Next.js static chunks and on-disk images ship with immutable, 1-year caching.

## Operational guidance

- Use `cachingStrategy.invalidateTag('merchant:{merchantId}')` in post-dispute workflows to flush a merchant's cached case list.
- Monitor Redis hit rate and Lambda duration in CloudWatch; expect up to ~40% reduction in DynamoDB read units for `/cases` and `/stats`.
- Adjust TTLs carefully: raising Redis TTL >5 minutes is safe for summary stats but may produce staler dashboards.

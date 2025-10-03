# DynamoDB Performance Audit

This report summarizes the bottlenecks that were identified during the audit of the DynamoDB usage across the codebase and documents the fixes that were implemented. Severity reflects the potential production impact before mitigation.

## Summary Table

| Issue | Severity | Affected Areas | Resolution |
|-------|----------|----------------|------------|
| Inefficient case access patterns (table scans, missing secondary-index usage) | High | `src/shared/db.ts`, consumers of `listCases` | Added merchant-scoped GSI queries, cursor-based pagination, and due-date/status projections to avoid full-table scans. |
| Missing write guards for idempotency & rate limiting | High | `src/shared/webhookIdempotency.ts`, `src/shared/rateLimit.ts` | Added conditional expressions and atomic updates to prevent race conditions and request amplification. |
| N+1 customer history queries | Medium | `src/shared/db-helpers.ts`, `src/handlers/submitCase.ts` | Centralized customer history fetch with caching and GSI usage to reuse a single query per request. |
| Merchant OAuth maintenance scanning entire table without pagination | Medium | `src/handlers/autoRefreshTokens.ts` | Implemented paginated, projection-based scan and deduplication to cap read throughput. |
| Stats endpoint scanning entire cases table without pagination | Medium | `src/handlers/statsHandler.ts` | Switched to DocumentClient pagination to stream segments and avoid attribute over-fetching. |
| Missing customer metadata on cases preventing GSI usage | Medium | `src/shared/db.ts`, `src/handlers/webhookStripe.ts`, `src/handlers/getDispute.ts` | Normalized composite keys, preserved historical attributes, and ensured Stripe data is captured on writes. |

## Detailed Findings

### 1. Inefficient Case Access Patterns (High)
- **Symptoms:** `listCases` performed a primary-key query followed by in-memory filtering and sorting, which degraded into full partition scans per request. Status-specific reads could not leverage the existing `gsi2` index because the hash key stored only the status, mixing all merchants.
- **Fix:** `listCases` now emits DynamoDB queries directly against `gsi2` (status + merchant) and `gsi1` (merchant + due date) or the `ByMerchantByCreatedAt` index. Pagination tokens are surfaced to callers to prevent unbounded reads. Merchant writes now store composite GSI keys so that queries remain scoped.

### 2. Idempotency & Rate Limiting Races (High)
- **Symptoms:** Both webhook idempotency writes and rate-limit counters used blind `Put` operations, so concurrent invocations could overwrite each other and allow duplicate processing.
- **Fix:** Added conditional expressions to the idempotency put and reworked the rate limiter to an atomic `UpdateCommand` guarded by `attribute_not_exists(count) OR count < :max`. This ensures isolation without auxiliary locks.

### 3. Customer History N+1 Queries (Medium)
- **Symptoms:** AI feature extraction executed five separate `QueryCommand` calls against the same customer history, each incurring a full partition scan with filter expressions.
- **Fix:** Introduced a shared customer-history loader that queries the `ByCustomerByCreatedAt` index once, caches the promise per invocation, and derives all downstream metrics in-memory.

### 4. Merchant Token Maintenance Scan (Medium)
- **Symptoms:** The token refresh scheduler scanned the entire merchants table without pagination, risking throttling as accounts grow.
- **Fix:** Replaced the one-shot scan with a paginated loop that projects only the fields needed for refresh calculations and deduplicates results by primary key.

### 5. Stats Endpoint Table Scan (Medium)
- **Symptoms:** `statsHandler` scanned the whole cases table with the low-level client, materializing AttributeValue maps and ignoring pagination, which risked exceeding Lambda timeouts.
- **Fix:** Migrated to the DocumentClient, added pagination, and limited the projection to only the attributes required for aggregation.

### 6. Missing Case Metadata for GSIs (Medium)
- **Symptoms:** Cases lacked `merchantId`, composite `customerId`, and order/refund metadata, so the supporting GSIs were underutilized and customer analytics were inaccurate.
- **Fix:** `upsertCase` now normalizes and preserves these attributes, loading existing records on update to avoid data loss. Webhook and manual ingestion paths were updated to pass Stripe charge metadata so GSI records stay populated.


# API Error Handling Audit

## Overview
- **Resilient handler wrapper:** Added `withErrorHandling` to centralize structured logging, retry logic, timeouts, and circuit breaker protection for every Lambda/API handler. 【F:src/shared/errorHandling.ts†L1-L205】【F:src/shared/errorHandling.ts†L206-L272】
- **Webhook hardening:** Hardened Stripe webhook validation, secret resolution, and secondary signature checks to close critical gaps. 【F:src/handlers/webhookStripe.ts†L120-L178】
- **Handler adoption:** All API handlers now delegate to the resilient wrapper with tuned options per endpoint. 【F:src/handlers/getCase.ts†L5-L54】【F:src/handlers/listCases.ts†L7-L119】

## Severity Matrix

| File | Severity | Issue Identified | Fix Implemented |
|------|----------|------------------|-----------------|
| `src/handlers/webhookStripe.ts` | **P0** | Webhook accepted unsigned payloads, lacked merchant-secret lookup, and had no retry/timeout guard, risking fraudulent event execution. | Added strict signature/header/body validation, merchant secret resolution, redundant validation, and wrapped in resilient handler with retries/timeouts. 【F:src/handlers/webhookStripe.ts†L120-L178】【F:src/handlers/webhookStripe.ts†L551-L559】 |
| `src/handlers/submitCase.ts` | **P0** | No global error guard around Stripe dispute submission pipeline; failures leaked unhandled Stripe errors and stalled submissions. | Wrapped handler with circuit-breaker-aware wrapper and preserved contextual error responses. 【F:src/handlers/submitCase.ts†L1-L276】 |
| `src/handlers/buildEvidence.ts` | **P0** | Evidence builder performed multiple Stripe/API/Dynamo mutations without fallback, risking partial writes and timeouts. | Adopted resilient wrapper to provide retries, timeout protection, and consistent logging around the workflow. 【F:src/handlers/buildEvidence.ts†L1-L375】 |
| `src/handlers/stripeSubmitEvidence.ts` | **P0** | Direct Stripe submission lacked try/catch, logging, or retry safeguards causing evidence loss on transient failures. | Wrapped with resilient handler for retries, timeout, and structured error logging. 【F:src/handlers/stripeSubmitEvidence.ts†L1-L29】 |
| `src/handlers/retryCase.ts` | **P0** | Retrying disputes invoked multiple external systems without failure isolation, leading to repeated crashes. | Applied resilient handler and centralized failure reporting. 【F:src/handlers/retryCase.ts†L1-L233】 |
| `src/handlers/collectCase.ts` | **P1** | Step Functions invocation had no guardrail; throttling produced unlogged crashes. | Wrapped with retry-aware handler to auto-retry transient Step Functions errors. 【F:src/handlers/collectCase.ts†L1-L42】 |
| `src/handlers/createCheckoutSession.ts` | **P1** | Checkout creation surfaced raw Stripe errors and no timeout handling. | Added resilient wrapper to provide consistent 500 responses and logging on Stripe failures. 【F:src/handlers/createCheckoutSession.ts†L1-L86】 |
| `src/handlers/refreshStripeToken.ts` | **P1** | OAuth refresh invoked Stripe without global error protection; rate limits crashed the Lambda. | Wrapped with resilience layer to add retries/backoff and structured errors. 【F:src/handlers/refreshStripeToken.ts†L1-L71】 |
| `src/handlers/autoRefreshTokens.ts` | **P1** | Scheduled refresh loop had no outer catch; a single merchant failure aborted the job. | Added resilient handler for retries/logging plus maintained per-merchant guard. 【F:src/handlers/autoRefreshTokens.ts†L1-L101】 |
| `src/handlers/listCases.ts` | **P1** | API lacked top-level failure handling; Dynamo/Redis errors bubbled to API Gateway. | Wrapped with retries/timeouts and kept cache fallbacks. 【F:src/handlers/listCases.ts†L7-L119】 |
| `src/handlers/getCase.ts` | **P1** | Missing top-level error guard meant DB failures crashed the Lambda. | Adopted resilient handler for consistent HTTP errors. 【F:src/handlers/getCase.ts†L5-L54】 |
| `src/handlers/getUserDisputes.ts` | **P1** | Redis/DB interplay lacked a global try/catch; transient outages caused unlogged crashes. | Wrapped handler for retries/logging while retaining local catches. 【F:src/handlers/getUserDisputes.ts†L1-L72】 |
| `src/handlers/disputesHandler.ts` | **P1** | Handler exposed Stripe/Dynamo errors directly and lacked timeout controls. | Applied resilient wrapper with 10s timeout and retry. 【F:src/handlers/disputesHandler.ts†L1-L176】 |
| `src/handlers/statsHandler.ts` | **P1** | Expensive Dynamo/Redis aggregation could hang; no circuit breaker triggered on repeated failures. | Added resilient handler with 12s timeout and retry. 【F:src/handlers/statsHandler.ts†L1-L201】 |
| `src/handlers/metrics.ts` | **P1** | Metric endpoint threw on Redis outage causing API failures. | Wrapped with resilient handler for retries/timeouts. 【F:src/handlers/metrics.ts†L1-L186】 |
| `src/handlers/authLoginHandler.ts` | **P1** | Authentication Lambda lacked global guard; JSON parse errors crashed the function. | Added resilient handler and contextual error response logging. 【F:src/handlers/authLoginHandler.ts†L1-L223】 |
| `src/handlers/authStripeCallback.ts` | **P2** | Missing timeout/retry around OAuth code exchange degraded reliability. | Wrapped in resilient handler. 【F:src/handlers/authStripeCallback.ts†L1-L110】 |
| `src/handlers/authStripeStart.ts` | **P2** | Lacked timeout guard on state generation but low impact. | Wrapped to ensure logging/timeouts. 【F:src/handlers/authStripeStart.ts†L1-L46】 |
| `src/handlers/getDispute.ts` | **P2** | Single Stripe fetch without guard; failure bubbled to client. | Wrapped to provide controlled error handling. 【F:src/handlers/getDispute.ts†L1-L18】 |
| `src/handlers/getPaymentIntent.ts` | **P2** | Missing wrapper around Stripe call. | Added resilient wrapper. 【F:src/handlers/getPaymentIntent.ts†L1-L14】 |
| `src/handlers/getCharge.ts` | **P2** | Similar to above. | Wrapped with resilience helper. 【F:src/handlers/getCharge.ts†L1-L38】 |
| `src/handlers/reportWeekly.ts` | **P2** | Weekly report job lacked outer guard; failure aborted email run. | Added resilient wrapper. 【F:src/handlers/reportWeekly.ts†L1-L71】 |
| `src/handlers/health.ts` & `health-minimal.ts` | **P2** | Health checks could hang when dependencies slow, no retries/timeouts. | Wrapped with resilient handler for quick failure and retry. 【F:src/handlers/health.ts†L1-L75】【F:src/handlers/health-minimal.ts†L1-L95】 |
| `src/handlers/debugRedis.ts` | **P2** | Debug endpoint lacked global guard, failing without logging request context. | Wrapped with resilient handler. 【F:src/handlers/debugRedis.ts†L1-L77】 |

> **Severity Legend:** P0 – production outage/security risk; P1 – high-impact reliability gaps; P2 – medium-impact resilience gaps.

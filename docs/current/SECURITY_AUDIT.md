# Security Assessment – StripedShield API

_Date:_ 2025-10-02

## Summary of Findings

| # | Area | Severity | Risk | Fix / Mitigation |
|---|------|----------|------|------------------|
| 1 | Authentication token handling | **Critical** | Hardcoded JWT secret allowed offline token forgery. | `authLoginHandler` now requires `JWT_SECRET` to be configured through the environment and logs missing configuration attempts. |
| 2 | Login input validation | **High** | Attackers could submit malformed payloads, bypass weak checks, or trigger DoS. | Added strict email sanitization/validation, payload parsing guards, and password length controls with security telemetry in `authLoginHandler`. |
| 3 | Login abuse controls | **High** | Unlimited brute-force attempts possible. | Added IP-based rate limiting with headers/Retry-After responses in `authLoginHandler`. |
| 4 | Metrics endpoint access | **Critical** | Previously unauthenticated metrics leaked operational data. | `metrics` handler now enforces Firebase auth, rate limits, security logging, and hardened CORS headers. |
| 5 | Redis debug endpoint | **Critical** | Endpoint exposed infrastructure details without auth/rate limits. | Added auth, allow-listed email enforcement, rate limiting, and secure CORS/logging in `debugRedis`. |
| 6 | Cross-origin protections | **High** | Wildcard `*` allowed credentialed requests from any origin. | Centralized CORS logic via `shared/security.ts` for all touched endpoints with explicit origin enforcement and security headers. |
| 7 | Security observability | **Medium** | Authentication failures/rate limit events were invisible. | Introduced structured `logSecurityEvent` telemetry for authentication, rate limiting, and error cases. |
| 8 | SQL/NoSQL injection review | **Low** | No injection vector found in DynamoDB usage; queries use keyed access. | No code change required; documented review. |

## Detailed Notes

### Authentication and Token Security
- `authLoginHandler` previously fell back to a hardcoded JWT secret, enabling token forgery if the environment variable was unset. The handler now pulls secrets via `requireEnv`, failing closed when configuration is missing. Additional headers harden responses and prevent caching.
- Passwordless demo access is disabled by default (toggleable via `ALLOW_PASSWORDLESS_DEMO_LOGIN`) and all login attempts are logged with redacted metadata for auditability.

### Input Validation & Sanitization
- Login payloads are parsed defensively with JSON error handling, email normalization, and regex validation to prevent script injections or abuse of downstream systems.
- Oversized passwords are rejected early, protecting hashing libraries from resource exhaustion.

### Authentication & Authorization Coverage
- Both `metrics` and `debugRedis` handlers now call `requireAuth` and emit security telemetry when tokens are missing/invalid.
- The Redis debug endpoint additionally requires an allow-listed email (defaulting to the founder account) or an explicit opt-in flag, eliminating unauthorised infrastructure introspection.

### Rate Limiting and Abuse Prevention
- Added configurable, in-memory rate limiting for login, metrics, and Redis debug handlers. Responses expose `Retry-After`, `X-RateLimit-*` headers for clients and monitoring.
- Shared helper tracks reset windows, enabling future migration to a distributed store if necessary.

### Cross-Origin Resource Sharing (CORS)
- Introduced centralized origin resolution and enforcement. Requests from unapproved origins now return 403, and successful responses include `Vary: Origin`, `X-Frame-Options`, and `X-Content-Type-Options` safeguards.
- OPTIONS preflight handling returns 204 with the negotiated headers, aligning with browser expectations.

### Logging & Monitoring
- Structured security logging covers: CORS denials, rate limit blocks, invalid payloads, authentication outcomes, and handler errors. Tokens and emails are redacted before logging to avoid leaking secrets.
- These logs give SOC and SIEM tooling hooks for real-time alerting.

### Data Layer Review
- Reviewed handlers interacting with DynamoDB (`listCases`, `getCase`, `submitCase`, etc.). All use key-based Get/Query operations; no raw string concatenation or unparameterized expressions observed. Injection risk rated Low; monitor for future dynamic queries.

### Recommendations
- Move rate limiting state into Redis or DynamoDB for horizontal scaling once available.
- Expand allow lists and RBAC claims in Firebase tokens so privileged endpoints can assert roles instead of static email lists.
- Consider enforcing HTTPS-only cookies and rotating JWT secrets regularly via AWS Secrets Manager.


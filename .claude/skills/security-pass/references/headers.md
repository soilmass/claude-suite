# Security headers to verify (edge / App Router)

Header misconfiguration is a top risk and ships when framework defaults are assumed safe.
Verify these are set and correct. In Next.js, set via `next.config` headers() or
middleware (edge-compatible).

| Header | Value (starting point) | Why |
|---|---|---|
| `Content-Security-Policy` | scoped to your origins; no unsafe-inline scripts | blocks XSS injection vectors |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | forces HTTPS |
| `X-Content-Type-Options` | `nosniff` | stops MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | limits referrer leakage |
| `X-Frame-Options` / CSP `frame-ancestors` | `DENY` / `'none'` | clickjacking |
| `Permissions-Policy` | disable unused features (camera, geolocation…) | least privilege |

Notes:
- Prefer CSP `frame-ancestors` over the legacy `X-Frame-Options` where supported; set both
  for coverage.
- CSP is the high-value, easy-to-get-wrong one — build it explicitly; don't ship a
  permissive default.
- Verify on the *deployed edge response*, not just config — middleware ordering can drop
  headers.

The exact recommended values date; perishable-refresh re-checks them against current
guidance.

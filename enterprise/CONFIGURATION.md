# Runtime configuration

The service requires real secrets and dependency addresses. Missing configuration fails closed; no embedded database, development identity, generated hardware measurements or fake booking fallback is used.

| Variable | Required value |
|---|---|
| DATABASE_URL | TLS PostgreSQL URI for a login role granted custodia_app, NOSUPERUSER and NOBYPASSRLS |
| MIGRATION_DATABASE_URL | Separate privileged migration URI; only used by scripts/migrate.mjs |
| DATABASE_CA | Private database certificate authority PEM when public system roots do not apply |
| REDIS_URL | rediss:// URI with authenticated Redis cluster credentials |
| OIDC_JWKS_URL | HTTPS signing-key discovery URL from your identity provider |
| OIDC_AUTHORIZATION_URL | HTTPS identity-provider authorization endpoint |
| OIDC_TOKEN_URL | HTTPS identity-provider token endpoint |
| OIDC_CLIENT_ID | Registered confidential web client identifier |
| OIDC_CLIENT_SECRET | Registered confidential client secret |
| OIDC_LOGIN_SCOPES | Provider-approved OIDC and records scopes including openid |
| SESSION_ENCRYPTION_KEY | Exactly 32 random bytes encoded as hex for HttpOnly cookie encryption |
| OIDC_ISSUER | Exact trusted issuer claim |
| OIDC_AUDIENCE | Exact API audience |
| PUBLIC_ORIGIN | Exact HTTPS browser origin allowed for mutations and MCP |
| LEDGER_HMAC_KEY | At least 32 cryptographically random bytes encoded as hex |
| LEDGER_KEY_ID | Version identifier retained with each signed event |
| ATTESTATION_URL | HTTPS trusted attestation service challenge endpoint |
| ATTESTATION_CLIENT_CERT | Mesh client certificate PEM for the native gateway |
| ATTESTATION_CLIENT_KEY | Matching private key PEM from deployment secrets |
| ATTESTATION_SERVER_CA | Approved gateway mesh CA PEM |
| ATTESTATION_PUBLIC_KEY | PEM verification key for the readiness attestation-service assertion |
| ATTESTATION_ISSUER | Exact service assertion issuer |
| ATTESTATION_SUBJECT | Exact measured workload identity bound by the trusted service |
| ATTESTATION_AUDIENCE | Exact service assertion audience |
| ATTESTATION_PCRS | JSON map of approved PCR index to 96-character lowercase SHA-384 digest |
| VPC_PROXY_HEALTH_URL | HTTPS health endpoint of the separately attested downstream proxy |
| CUSTODIA_RELEASE | stable or candidate; metrics label |

OIDC token claims: sub, exp, tenant_id (UUID), scope (space-separated permissions). Scopes: records:read, records:write, records:release, metrics:read. Identity-provider administrators must control tenant membership claims. Browser input never chooses tenant identity.

Readiness assertion wire format: JSON with payload and signature, both base64url. payload decodes to JSON containing nonce, issuedAt (epoch milliseconds), issuer, audience, subject, hardwareVerified=true, debug=false and pcrs. Signature uses SHA-256 and the configured asymmetric public key. The trusted service must independently validate vendor hardware quotes. This application validates the service assertion; it cannot transform a self-assertion into hardware evidence. Protected tenant transactions require a fresh service assertion, cached for no more than ten seconds and never beyond its thirty-second freshness window.

The stricter standalone security/attestation.mjs component validates Ed25519 JWS and additionally requires a vendor quote verifier callback. It is an alternate integration component, not the wire format consumed by the Next.js readiness endpoint. security/mtls.mjs similarly requires an external credential provider; it does not establish non-exportable HSM custody itself.

Apply migrations once with the migration runner. Provision the runtime login separately and GRANT custodia_app to it; never use a table owner with bypass privileges for request traffic. All application state writes use a single checked-out connection and transaction-local tenant setting. PostgreSQL table owners can alter triggers and schemas, so separate credentials, restricted administrative access and external immutable audit storage are still required.

HMAC key rotation needs a retained versioned verification keyring. Do not discard historical key material. HMAC establishes integrity for a shared-secret verifier; it is not third-party nonrepudiation. Database and event insertion commit atomically. Sequences serialize per tenant with an advisory transaction lock and remain bigint strings.

Demo submissions are durable consultation requests, not calendar bookings. A configured staffed intake process or calendar-provider integration must handle them. The API rate-limits each email via Redis; an edge IP rate limit and bot control remain required before public high-volume exposure.

The Next.js /console workspace now supports organization OIDC code flow with PKCE/nonce and encrypted Secure HttpOnly cookies, durable intake, tenant-scoped request reads and guarded state transitions. It does not perform document export. Access JWTs longer than 2400 characters are rejected to stay within cookie limits; use compact provider claims. Session cookies last at most one hour and never outlive the JWT; refresh tokens are not stored.

Document pipeline inputs are specified in documents/README.md. Connector encryption and Graph content boundaries are specified in connectors/README.md. Runtime secret ingestion and region data infrastructure are specified in infra-v2/README.md. Attestation transport now requires TLS1.3 client certificates; no unauthenticated HTTPS fallback remains.

# Custodia enterprise application

This directory is the new Next.js application. The parent retains the original TanStack/Grok application unchanged. Deploy from this directory for Next.js hosting, or build the parent Dockerfile for Kubernetes. Do not deploy the original parent package and assume the enterprise routes exist there.

## Verification

`npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` are the local gates. `npm run dev` starts development; `npm start` serves the production build. The Docker image runs the standalone entrypoint. `npm run db:migrate` uses a separate privileged TLS migration connection.

See CONFIGURATION.md for runtime inputs. No secret defaults are accepted. The site renders without backend configuration; operational APIs correctly return unavailable or unauthorized when dependencies or identity are absent. A marketing render is not proof of operational readiness.

## API

- GET /api/v1/ready: bounded parallel dependency health matrix, HTTP 200 or 503.
- GET /api/v1/requests: tenant records, records:read.
- POST /api/v1/requests: intake creation, records:write.
- PATCH /api/v1/requests: checked version and state transition, records:write; terminal release additionally requires records:release.
- POST /api/v1/demo: durable consultation intake with Redis email rate limit; no calendar booking is fabricated.
- POST /api/mcp: MCP SDK Streamable HTTP JSON responses with tenant tools and workflow resource.
- GET /api/v1/metrics: authenticated Prometheus scrape, metrics:read.
- GET /api/auth/login and callback: OIDC authorization code/PKCE sign-in.
- POST /api/auth/logout: clear encrypted session cookie.

/console provides durable request intake and guarded transitions. Its release-state button explicitly does not export records. Actual source connectors, document workflows, redaction export and broader tenant administration remain integration work listed in IMPLEMENTATION_STATUS.md.

Outbound files define guarded routing and draft sequences. No delivery network has been activated. Security components define trust verification and mTLS integration; they cannot replace actual vendor hardware quote validation or a non-exportable HSM TLS provider.

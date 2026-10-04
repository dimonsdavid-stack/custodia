# Custodia containment boundary

`attestation.mjs` verifies an Ed25519-signed attestation-service assertion, a fresh one-use nonce, audience, issuer, expiration, debug prohibition, and exact SHA-384 PCR measurements. The injected `verifyHardwareQuote` must verify the cloud vendor's certificate chain, quote signature, nonce binding and measured image. Without that verifier, attestation fails. A signed JWT by itself is never hardware evidence. Approved PCRs and trust anchors must come from the actual signed image release and attestation service; the schema contains no invented production measurements.

The nonce store is bounded and process-local. In a multi-replica deployment, route each challenge back to its originating verifier or replace it with Redis atomic GETDEL and TTL. Do not share a nonce across processes without atomic consumption. The calling runtime must enforce the returned expiry before every protected operation; successful verification must not permanently unlock a tenant.

`mtls.mjs` validates TLS 1.3, matching key and certificate, externally issued certificates with a maximum remaining lifetime of 24 hours, server identity through normal HTTPS hostname verification, bounded sockets and a 5-second probe timeout. Credential rotation is serialized and old pools are closed. Credential retrieval errors fail closed. No local key-generation fallback exists.

Important integration boundary: Node's PEM key API loads private key material in software memory. The provider's `hardwareBacked` assertion is a required deployment provenance gate, not proof of non-exportability. This module does not implement a PKCS#11 engine or cloud HSM signing bridge and must not be advertised as a non-exportable HSM client. For strict hardware custody, terminate mTLS in a separately attested proxy with a native HSM provider and use this module only for proxy health verification, or supply an independently validated native TLS integration. An actual TEE, attestation service, trusted PCR manifest, issuer certificates and proxy are required before production readiness can be claimed.

Verification: `node --test enterprise/security/security.test.mjs` from the project root.

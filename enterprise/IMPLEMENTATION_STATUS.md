# Custodia continuation release

## Added in this continuation

Real Microsoft Graph delta and Laserfiche Cloud folder APIs now use encrypted tenant credentials/cursors, bounded retries, exact provider destinations and atomic sync state. Microsoft Graph content import binds an indexed tenant item to an approved public download hostname, pins resolved IPv4, limits binary sizes and sends content into the document pipeline. Laserfiche binary imports and recursive discovery are not yet implemented.

Document uploads support bounded UTF-8 text, JSON and searchable text-only PDF. The original, sanitized artifact and policy use tenant-derived AES-256-GCM; relational data is forced-RLS. Sanitized previews, named version approvals and immutable signed document events precede CSV/XLSX/JSON-LD/PDF exports. PDF matched content is removed and pages are raster flattened into a new PDF. Images, scans, ambiguous Unicode geometries and OCR-dependent inputs fail closed. Detection is policy-based, not a claim of perfect legal or sensitive-data identification.

Native Rust source requests actual AWS Nitro NSM documents over AF_VSOCK, verifies COSE/certificate chains/nonce/PCRs and signs gateway assertions through an external HSM provider. The EIF source now contains the PDF sanitizer with its separate bounded VSOCK channel. The application consumes gateway assertions through TLS1.3 mTLS. This does not place Next.js, Postgres or the structured text sanitizer inside the enclave. Native code has not been compiled or executed on hardware here.

Additional Terraform source covers encrypted multi-AZ Postgres, cross-region read replica, regional Redis HA and scoped Secrets Manager/EKS Pod Identity. Secret/network renderers supply the current runtime mappings; production E2E verifies real tenant/session boundaries and does not simulate credentials. Secondary database replication is asynchronous and read-only until deliberately promoted. Public TLS egress remains public TCP443 with application host checks; standard NetworkPolicy does not implement FQDN filtering.

## Verification evidence

- 25 Node tests pass: RLS/foreign-key boundaries, append-only audit, session encryption, connector destination/retry rules, document encryption/redaction, formula safety and export fidelity.
- 3 Python tests pass: PDF destructive redaction/flattening, blank PDF rejection and non-PDF rejection.
- Next.js production build, lint and TypeScript pass.
- YAML, deployment renderer and shell syntax checks pass.
- Production HTTP serves landing and document interface; protected routes return unauthorized without identity; unconfigured dependencies return readiness unavailable.

## Unverified prerequisites

No AWS credentials/configuration, cloud account target, runtime secret mounts, real provider credentials, production domain, real identity/test fixtures or Nitro device exist in this workspace. Terraform, Docker, AWS CLI and Cargo are unavailable. Consequently there is no actual infrastructure apply, native compilation, HSM signature, vendor API call or full operational integration proof. Chromium download returned invalid archive bytes; browser installation and visual/production E2E execution could not complete.

CI now runs native Rust and PDF tests in addition to existing gates and offers separately configured real production E2E. CI definitions have been parsed, not executed remotely. No public live website or production readiness claim is made. PyMuPDF commercial distribution requires an applicable AGPL or commercial license. Existing parent TanStack/Grok fixture application is retained unchanged and is not the new deployment root.

## Next execution junction

Supply the actual AWS deployment account/role, state bucket, cluster networking inventory, Secrets Manager runtime identity, approved Nitro EIF/root/PCR policy and HSM provider. Run native compile/provider validation and staging integration before infrastructure apply. Verify real provider permissions/imports, OCR/image-review requirements, backup recovery, regional write fencing and security/load gates. Then run the production identity/tenant/browser suite on the actual HTTPS deployment before enabling commercial use.

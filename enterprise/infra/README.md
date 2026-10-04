# Custodia infrastructure and release contract

These are implementation files, not a record of a cloud deployment or production load test. AWS credentials, a durable Terraform state backend, DNS ownership, external dependency endpoints, initialized hardware and production secrets must exist before promotion can succeed. Missing dependencies fail readiness and promotion.

## Regional architecture

`terraform/` creates three-zone VPCs and private EKS clusters in two distinct AWS regions, private managed node groups, per-zone NAT gateways, audit logs, VPC flow logs, a rotating multi-region KMS encryption key and optional two-device CloudHSM clusters per region. Provider and module versions are constrained. Kubernetes version and administrator role are mandatory validated inputs rather than invented account identifiers.

Use an encrypted, versioned S3 state bucket with restricted IAM and backend locking. Pass bucket, region, key and `use_lockfile=true` to `terraform init -backend-config`; no state credentials belong in source control. The state bucket is intentionally not bootstrapped inside the stack it stores. A saved plan must be inspected before apply. AWS API and billing effects have not been exercised here.

CloudHSM provisioning does not initialize an HSM or enroll Crypto Users. KMS envelope encryption does not turn an EKS node into a trusted execution enclave. Standard application nodes are not advertised as Nitro Enclaves. The attestation authority and measured workload must run on independently provisioned enclave-capable infrastructure with verified measurements, nonce handling and trust roots. Application readiness requires that authority to pass cryptographic verification.

CloudFront uses HTTPS regional origins and disables caching for authenticated application traffic. Origin DNS names must already have valid TLS certificates and point to deployed ingress controllers. Origin failover is for supported read methods; it does not retry or guarantee availability for write transactions. Database replication, ownership fencing and failover orchestration must be established before treating two regional web deployments as an active-active data service. Infrastructure does not provision or claim those guarantees.

## Container

The root Dockerfile builds `enterprise/` independently, copies Next.js standalone output and static assets into a distroless Node 22 image, and runs as UID 65532. Runtime secrets are not passed during build. Production must pin the verified base-image digests during release policy enforcement; mutable upstream tags are not supply-chain attestations. Image build, scan, SBOM and provenance are gates in the workflow.

## Cluster prerequisites

Install ingress-nginx in the `ingress-nginx` namespace and a metrics-server. Enable EKS VPC CNI network-policy enforcement (configured by Terraform) and verify enforcement in each cluster. Supply `custodia-runtime` from an audited secret manager, using the environment contract in the enterprise backend. Supply `custodia-attestation` only with verified attestation trust material. Do not place database owner credentials in the application secret. Grant application membership in the restricted database role.

`base.yaml` restricts ingress to the ingress controller, DNS to CoreDNS, and egress to explicitly trusted same-namespace dependency pods or a dedicated mTLS egress proxy namespace. It deliberately does not allow arbitrary internet egress. For managed Postgres/Redis and external attestation endpoints, install narrowly scoped endpoint-specific egress policy based on their actual private routing; broad public-address allowances undermine containment. Certificate rotation and hardware-key operations are performed by the attestation/proxy deployment, not by an application pod pretending to own hardware keys.

The renderer requires an immutable image digest. It sets read-only root filesystems, drops Linux capabilities, disables service-account token mounting, sets resource bounds, spreads pods across zones and gates startup/readiness on the full dependency matrix. Generate ingress with `render-ingress.mjs` using two real DNS names, an existing TLS secret and explicit deployment-runner CIDRs; candidate ingress enforces the source-address allowlist. Ensure the ingress controller preserves and validates client source addresses behind the load balancer. Candidate ingress must be private or restricted to deployment probes; it is never an unreviewed public tenant endpoint.

## Delivery and rollback

`.github/workflows/enterprise.yml` runs TypeScript checks, Next.js production compilation, dependency vulnerability checks, CodeQL, Trivy secret/misconfiguration scans, ephemeral Postgres migration execution and Terraform validation before building a registry image. Configure GitHub variables for cluster names, regions, candidate URLs, private Prometheus URLs and the audited AWS OIDC deployment role. Configure the Prometheus read-only token as an environment secret. Production promotion is inactive unless `CUSTODIA_DEPLOY_ENABLED=true`. The deployment runner must carry the `custodia-vpc` label and reach the private Kubernetes API; public GitHub runners cannot reach it by assumption.

Migrations are validated in an isolated CI database; promotion does not silently run owner-level migrations. Apply reviewed forward-compatible migrations through an independently authorized migration identity before the image release. Application image rollback never rewinds committed database transactions or an append-only ledger. Destructive schema changes require a separate staged data migration.

The promotion script deploys an isolated candidate, verifies its deep readiness repeatedly, and queries real Prometheus counters. No results, malformed counters or a 5xx ratio above 1% deny promotion. Stable deployment then rolls with zero unavailable pods; observed failure rolls back to the previous immutable image. Prometheus must scrape `/api/v1/metrics` and preserve `release` and `status` labels on `custodia_http_requests_total`. Authenticated candidate smoke and representative tenant workloads must supply traffic; an empty telemetry window must never be accepted as proof.

## Validation status

Local static checks cover shell syntax, JavaScript parsing, YAML loading and deployment/ingress renderers. Terraform provider initialization, AWS plan/apply, container build/scanning, hardware attestation and Kubernetes rollout require their respective installed tools and connected infrastructure. The workflow defines those gates but is not evidence they already passed. Recovery drills, tenant isolation tests and measured production service-level objectives remain prerequisites to an availability claim.

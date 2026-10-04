# Custodia data and secret infrastructure

This is a separate Terraform state layered over `enterprise/infra/terraform`. It reads that stack's primary/secondary VPC and cluster outputs; it does not re-create EKS. Supply the actual private subnet IDs and EKS node security group IDs from the existing cluster networking inventory. Separate backend state must be encrypted, versioned, locked and access-controlled; the Redis auth token is sensitive but still exists in Terraform state. No defaults silently choose an account, cluster, credential or secret.

## Deployment sequence

1. Authenticate AWS with an OIDC deployment role or AWS SSO. Run Terraform from a private deployment runner that can access EKS and RDS.
2. Initialize the separate encrypted S3 backend. Supply variables through an encrypted CI environment or a restricted variables file. `primary_region`, `secondary_region`, `environment`, `foundation_state_bucket`, `foundation_state_key`, `foundation_state_region`, both private subnet lists, both node security group IDs, `application_secret_arn`, `application_secret_kms_key_arn`, and `redis_auth_token` are required.
3. Run `terraform fmt -check`, `terraform validate`, `terraform plan -out=custodia.tfplan`. Review the actual costs, database engine availability, account and networking. Apply the reviewed plan through the deployment role. The database is encrypted, deletion-protected and not publicly exposed.
4. Use the generated RDS administrator secret only in the migration/bootstrap job. Apply existing migrations and provision a LOGIN role without SUPERUSER, BYPASSRLS, schema ownership or migration privileges. The application's `DATABASE_URL` must use that role, never `custodia_admin`; the existing transaction code rejects superusers/BYPASSRLS.
5. Create a Secrets Manager JSON secret containing the runtime's required environment keys. `DATABASE_URL` is `postgresql://` followed by the percent-encoded application username/password, actual writer hostname, `:5432/custodia`; `DATABASE_CA` contains the RDS trust bundle. `REDIS_URL` is `rediss://:` followed by the percent-encoded Redis authentication token, actual primary cache hostname and `:6379`. Supply `SESSION_ENCRYPTION_KEY`, `LEDGER_HMAC_KEY`, `LEDGER_KEY_ID`, real OIDC issuer/JWKS/token/authorization/client/audience/scopes keys, `PUBLIC_ORIGIN`, and the containment configuration required by the hardware integration. Generated endpoints are Terraform outputs; secret contents are never Terraform outputs.
6. Install a reviewed External Secrets Operator release in `external-secrets` using the `external-secrets` service account. The existing EKS foundation includes the Pod Identity Agent; this layer associates the operator with a scoped IAM role. Set `AWS_REGION` and the actual `CUSTODIA_SECRET_ARN`, run `node render-secrets.mjs /secure/custodia-external-secrets.json`, and `kubectl apply -f /secure/custodia-external-secrets.json`. It creates a namespace-scoped store and secret in the existing `custodia` namespace. The operator's AWS SDK uses Pod Identity credentials; no static access keys are stored in Kubernetes.
7. Reference Kubernetes Secret `custodia-runtime` through the application Deployment's `envFrom`. Roll out when keys rotate; environment variables do not update in existing processes. For immediate rotation, mount secret volumes and explicitly add reload support instead of assuming refreshInterval updates process memory.
8. Set `CUSTODIA_AWS_ACCOUNT_ID`, `AWS_REGION`, `CUSTODIA_CLUSTER_NAME`, `CUSTODIA_SECRET_ARN` and run `./preflight.sh`. It verifies identity, cluster status, secret metadata, Kubernetes read access and initialized Terraform validation. It never retrieves or prints secret values and never applies infrastructure.

## Regional operating boundary

The secondary RDS instance is a read replica, not a second writer. PostgreSQL cross-region replication is asynchronous: measure replica lag and document recovery-point loss. Do not point secondary write traffic to it or announce zero-RPO failover. Primary Redis has Multi-AZ replication within its region; the secondary region needs its own disposable coordination cache before activation. Existing CDN origin failover only protects eligible read requests; it is not transactional failover for POST/PATCH.

A regional recovery requires an authorized operator to fence primary writes, assess replica lag, promote the replica, create/update the secondary region application secret and Pod Identity association, deploy/verify the region's containment hardware and routing, and only then route write traffic. HMAC signing keys and ledger key IDs must remain consistent for historical verification. This stack intentionally does not automate destructive promotion or speculative cloud purchases.

## Production browser verification

Install `@playwright/test` and its Chromium browser through the package lock / reviewed CI dependency update. Execute `npx playwright test --config playwright.config.mjs` from `enterprise` with:

- `CUSTODIA_E2E_ORIGIN`: actual HTTPS production origin.
- `CUSTODIA_E2E_TOKEN_A`, `CUSTODIA_E2E_TOKEN_B`: actual OIDC access tokens for two dedicated test tenants with read/write scope.
- `CUSTODIA_E2E_RECORD_A`, `CUSTODIA_E2E_RECORD_B`: pre-provisioned test record UUIDs visible in the latest 100 records of the corresponding tenant.
- `CUSTODIA_E2E_STORAGE_STATE`: restricted local Playwright storage-state file from a completed OIDC login for a dedicated test identity.

Tests check responsive rendering, real readiness, anonymous rejection, authenticated persistence across separate connections, cross-tenant read/update denial, hostile-origin rejection, PKCE login cookies and session tamper rejection. No successful production write is performed; the only PATCH targets a foreign tenant fixture and must return 404. Tokens and cookie values are not logged; traces, screenshots and video are disabled to avoid capturing identity provider/session data. Never commit storage-state files or results containing credentials. A missing deployment/token/fixture is a failing verification prerequisite, not a simulated passing test.

## Validation performed here

Node syntax checks for both JavaScript implementations and `bash -n` for preflight passed. AWS CLI, Terraform, cloud credentials, production origin, OIDC tokens, browser session fixtures and Playwright test dependency were not available in this workspace. Terraform provider validation, infrastructure plan/apply and production E2E were therefore not run. This is an implementation delivery, not a claim of provisioned production infrastructure.

## Primary implementation references

- https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance
- https://developer.hashicorp.com/terraform/tutorials/aws/aws-rds
- https://external-secrets.io/latest/provider/aws-access/
- https://docs.aws.amazon.com/eks/latest/userguide/manage-secrets.html

## Added document, connector and enclave configuration

The runtime JSON secret must additionally contain `ATTESTATION_CLIENT_CERT`, `ATTESTATION_CLIENT_KEY`, `ATTESTATION_SERVER_CA`, `CONNECTOR_ENCRYPTION_KEY` (32-byte hex), `DOCUMENT_ENCRYPTION_KEYS` (JSON object mapping retained key IDs to 32-byte hex), `DOCUMENT_KEY_ID`, `GRAPH_DOWNLOAD_HOSTS` (comma-separated exact administrator-approved SharePoint download hostnames), `REDACTION_WORKER_URL` (actual parent gateway HTTPS URL ending /redact), `REDACTION_CLIENT_CERT`, `REDACTION_CLIENT_KEY`, and `REDACTION_SERVER_CA`. Preserve all historical document key IDs. Do not replace a keyring with only its latest key.

The generated ExternalSecret now supplies both `custodia-runtime` and the required `custodia-attestation` public-key mount. Private keys are only in the protected runtime secret; HSM signer keys remain PKCS11 URIs on the parent host. The redaction gateway has its own mounted TLS certificate/key/client CA and actual ENCLAVE_CID, and runs `gateway.py`; use `server.py` only for explicitly non-enclave deployments, never as a hardware fallback.

Apply the rendered network supplement after the existing containment policy: set `CUSTODIA_VPC_CIDR` to the deployed regional private /16, `CUSTODIA_ENCLAVE_PARENT_CIDR` to the actual parent IPv4 /32, then run `node render-network.mjs /secure/network.json`. This admits RDS/Redis within the VPC and mTLS to the specific enclave parent. Standard Kubernetes NetworkPolicy cannot restrict public TLS egress by hostname; the supplement permits public TCP443 while the application constrains provider/identity URLs and pinned DNS for signed content downloads. For stricter FQDN enforcement, deploy an independently verified egress gateway or Cilium DNS policy before asserting a hostname-restricted network boundary. Do not assume HTTP_PROXY automatically changes Node fetch or HTTPS requests.

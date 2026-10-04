# Live repository connectors

The routes require OIDC scopes `connectors:read`, `connectors:write`, and `connectors:sync`. Configuration never appears in list responses. Every configuration, pagination cursor, and provider metadata envelope uses AES-256-GCM with tenant, connector, and purpose bound AAD. Provision `CONNECTOR_ENCRYPTION_KEY` as a 32-byte hex secret in the existing secret manager. This key must be backed up and rotated with a decrypt/re-encrypt migration; replacing it blindly makes old ciphertext unreadable. Apply migration 002 with the administrative migration role; application users must remain non-superuser and NOBYPASSRLS.

`POST /api/v1/connectors` accepts one of these schemas: Graph `provider`, `directoryId` UUID, `clientId` UUID, `clientSecret`, `driveId`; Laserfiche `provider`, `authorizationKey`, `repositoryId`, integer `folderId`. Responses return connector UUID and provider. `POST /api/v1/connectors/sync` accepts `id` UUID and synchronizes one bounded page. Call again until `complete=true`. Graph retains its delta link. Laserfiche enumerates the configured folder and resumes nextLink pagination; after completion a subsequent cycle enumerates that folder again. It does not recursively enumerate descendants or claim deleted-item detection for Laserfiche. Graph deletion tombstones are retained. Metadata canonical SHA-256 hashes describe metadata, not binary document hashes.

Concurrent syncs use optimistic version checks and a row lock. Item updates, cursor advancement, and immutable signed audit append commit in one tenant-scoped transaction. Requests validate exact HTTPS provider hosts and resource path before following pagination. Redirects are never followed. Each response is bounded to 4 MiB; retries are capped at four attempts and each attempt at 12 seconds. No source binary or download URL is fetched. Document binaries require the separate document ingestion workflow; no connector claims otherwise. Tokens exist only in request memory and are reacquired through client credentials, never stored or emitted in logs.

Microsoft Graph must have administrator-approved application access to the selected drive; restrict service principal permissions to selected sites where compatible. Laserfiche requires a Cloud OAuth service application and a generated long-lasting Authorization Key bound to the service principal. The adapter uses the documented authorization-key alternative to the HMAC credential and requests `repository.Read`. Key expiration/rotation requires updating configuration through creation of a replacement connector; there is no silent fallback.

Primary specifications:
- https://learn.microsoft.com/en-us/graph/api/driveitem-delta
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- https://developer.laserfiche.com/docs/api/authentication/guide_oauth-service/
- https://developer.laserfiche.com/docs/api/authentication/guide_oauth_2.0_scopes/

Verification: `node --import tsx --test connectors/connectors.test.ts`. Provider tenancy, permission assignments, live pagination, API availability, encrypted database persistence, and recovery after 410 delta expiration require staging credentials. A Graph 410 fails with a 409 and retains the old cursor rather than silently dropping records; create a replacement connector for a full verified resync.

## Graph binary document import

`POST /api/v1/connectors/import` requires connectors:read and documents:write with `{connectorId,itemId,requestId,policy}`. The item must already exist in the authenticated tenant's indexed connector. It reacquires Graph metadata and a fresh signed download URL, requires the exact administrator-approved hostname from `GRAPH_DOWNLOAD_HOSTS`, resolves/pins a public IPv4 address, rejects private/link-local destinations and redirects, and caps the binary at 5 MiB and 15 seconds. It forwards the binary into the encrypted redaction/approval pipeline and clears the source buffer after ingestion. It never forwards Graph bearer credentials to the signed download host. Original source item remains unchanged. Laserfiche binary download is not implemented in this import route.

# Configuration, deployment and recovery

## Configuration and ownership

Run `npm run setup` to create local keys and copy `.env.example` only when `.env` is absent. It preserves existing secrets. Keep `.env`, `.local`, Mongo credentials, private keys, refresh tokens, provider credentials and backups out of source control and images. Windows directory permissions must restrict the actual secret files to the project operator; Unix file modes are also set by the scripts.

Local development uses separate authenticated `readWrite` users for `nexvia_identity`, `nexvia_profile`, `nexvia_opportunity`, `nexvia_matching`, `nexvia_community`, `nexvia_notification`, and `nexvia_cv`. Each process opens only its database. The gateway has no database credential. New environments require a replica set because domain mutations and durable events use transactions.

| Configuration                                                                   | Owner                         |
| ------------------------------------------------------------------------------- | ----------------------------- |
| `CLIENT_ORIGIN`, `SERVICE_URLS_JSON`, user/service public-key registries        | Gateway and relevant services |
| `<SERVICE>_MONGO_URI`, `SERVICE_PRIVATE_KEY[_FILE]`                             | That service only             |
| `USER_JWT_PRIVATE_KEY[_FILE]`, `TOKEN_ENCRYPTION_KEY[_FILE]`                    | Identity only                 |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | Notification only             |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, optional `CV_FONT_PATH`                       | CV only                       |

The root `.env` is a development convenience. Production uses per-service hosting secrets and explicitly authenticated Mongo URIs, TLS database connections, HTTPS browser origin and HTTPS service URLs. `NODE_ENV=production` rejects HTTP browser/internal URLs and enables secure cookies. Route the browser's `/api/v1` under its web origin. Service ports remain private; never expose domain APIs or Mongo publicly.

## Gmail

When placing the gateway behind a reverse proxy, configure `TRUST_PROXY` with only that proxy's actual IP/CIDR addresses. The provided Nginx configuration replaces `X-Forwarded-For` with its observed client IP. An empty trust list ignores forwarded client IPs. Do not use a blanket trust setting; approved proxy identity preserves accurate sign-in IP limits.

Enable Gmail API on the intended Google project, create a web OAuth client, authorize the intended sender with the minimum `https://www.googleapis.com/auth/gmail.send` scope and offline access, and securely store the returned refresh token. Set the four `GMAIL_*` variables in Notification's environment; `GMAIL_SENDER` must identify the authorized mailbox or a permitted send-as identity. Restart Notification after changing provider configuration. Follow Google's [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

The adapter refreshes access tokens server-side and sends an individual MIME message through Gmail API using a base64url `raw` body, following [Google's sending guide](https://developers.google.com/workspace/gmail/api/guides/sending). Verification/recovery links use URL fragments. No recipient lists are disclosed. Provider acceptance is distinct from recipient inbox delivery.

Unconfigured jobs remain `blocked`; optional opportunity/CV email defaults off, application email defaults on. Verification/recovery are transactional. Rate/quota/provider failures use bounded retries. A timeout during send or an abandoned running job becomes `unknown`, which is never blindly retried. In Administration, record provider evidence and either accepted message ID or confirmed-not-sent decision. Every manual decision is audited. `gmail.send` alone cannot inspect sent-message history; use an authorized operator's provider evidence for reconciliation.

Before staging acceptance, verify actual registration/verification/reset mail, sender authorization, refresh-token renewal, optional preferences, suppression after archive or account revocation, provider error handling and unknown-send reconciliation. No live message was sent by the implementation tests.

## Gemini and PDFs

Configure `GEMINI_API_KEY` and an available structured-output-capable `GEMINI_MODEL` in CV. Model availability and data processing policy are operator decisions. Review [Google's structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output) when choosing a model.

Consent applies to each job. The implementation sends a bounded list of factual career sentences; Gemini returns validated sentence indices. It cannot add qualifications, awards or employers to the CV. Missing configuration, invalid output or provider failure uses the factual template. This intentionally implements assistance as factual summary selection. Email, registration numbers and full account records are excluded from model input. User review is required for export/submission.

PDFKit embeds the bundled OFL Noto Sans Latin, Sinhala and Tamil fonts, performs script-specific font selection and automatically creates pages. `services/cv-service/assets/LICENSE` and the font source information must accompany redistribution.

## Provision a real administrator

Set `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters), `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_STAFF_REFERENCE`, and `ADMIN_BOOTSTRAP_EVIDENCE` through a protected operator environment. Run `node scripts/provision-admin.mjs` against explicitly configured Identity/Profile databases. It creates a new administrator only, records provisioning evidence, and queues email ownership verification. Secrets are never printed. Keep development demo accounts out of production.

## Keys and sessions

User and service JWTs use RS256 with fixed issuer/audience/expiry and registered key identifiers. Identity access expires after five minutes; refresh tokens rotate and replay revokes account sessions. CSRF proofs bind to the session and last one day. Private-resource operations check current account status and fail closed when Identity is unavailable.

For rotation, first distribute both old and new public keys to receivers. `USER_JWT_PUBLIC_KEYS_JSON` maps user key IDs to public PEM; `USER_JWT_KEY_ID` selects the signing identity (initially `identity-1`). `SERVICE_PUBLIC_KEYS_JSON` maps service key IDs to public PEM; the new caller key ID must use `service:version`, and `SERVICE_KEY_ID` selects it. Only that caller receives its new private key. Switch signers after all receivers accept both IDs; retire previous public keys after the longest issued token expires plus bounded clock skew. CSRF proofs require a one-day overlap or an intentional session/CSRF renewal. Never print private-key environment values while doing this. `/api/v1/auth/jwks` publishes public JWK metadata inside the API's `data` envelope. Receivers use their configured cached registry rather than a network dependency for every request.

## Start, stop and health

`npm run dev` starts Mongo, the gateway, seven services and Vite. Use Ctrl+C to stop the stack and release its ports. The database directory and users persist. `/health/live` reports process liveness; `/health/ready` reports database readiness. The gateway's readiness aggregates all seven services. Workers run with their API processes; deploy capacity that keeps them awake.

Service stdout/error logs contain request IDs and operational error codes. They omit passwords, cookies, tokens, email/CV text and database URIs. Admin operations expose owner-local outbox/audit histories. Watch failed outbox events, overdue leases, unresolved delivery, repeated worker/dependency failures and readiness. Match/dispatch/CV states are persisted and user-visible. Production alert routing and measured uptime require hosting/monitoring configuration.

## Containers and hosting

Each domain/gateway has its own Dockerfile. Frontend builds into an Nginx image with same-origin API forwarding, CSP and SPA fallback. Local Compose starts private authenticated Mongo, initializes the replica and seven database users, then starts independent service images.

```powershell
npm run setup
docker compose --env-file .local/compose.env -f infrastructure/compose.yaml up --build
```

Open http://localhost:8080 for the container demonstration. Stop with the matching `docker compose ... down` command, retaining volumes. Do not use volume removal for routine restarts. Docker was not installed on the implementation workstation; validate Compose/image startup on a Docker host. CI includes separate service image builds. Follow `infrastructure/render/README.md` or `infrastructure/aws/README.md` for staging/production TLS, secrets and network design. No cloud resources or paid subscriptions were created.

## Migration

Set `LEGACY_MONGO_URI` explicitly to a read-only source credential. Set the new service URI/secret configuration separately. Run `node scripts/migrations/legacy.mjs` for a redacted count report and `--apply` only after reviewing it and taking backups. Pause source and target writes during cutover.

The importer preserves account/content/application IDs and password hashes, maps `company` to `employer`, separates suggested rows from real applications, keeps legacy career/academic facts and interactions in owner-local private review collections, and creates opportunities as reviewable drafts. Migrated automatic approvals are reset; accounts need ownership/institutional review and discovery defaults off. A missing original application snapshot remains explicitly marked missing; current profiles are never substituted. The importer is rerunnable. Automated migration tests use synthetic source data; no real legacy database was migrated.

## Encrypted backups and restore rehearsal

Pause writes and workers across the stack to take a consistent logical snapshot. Generate a separate 32-byte hexadecimal `BACKUP_ENCRYPTION_KEY` and store it separately from archives. Set `BACKUP_MONGO_URI` to one owner database at a time, then run:

```powershell
node scripts/backups.mjs backup path/to/identity.nxbackup
```

Archive files use AES-256-GCM with authenticated compressed BSON/EJSON, including indexes. The destination file must be new. Repeat for every owner database and retain an operator manifest of snapshot time and image versions. Transfer archives to encrypted restricted storage; retain encryption keys outside the archives.

For rehearsal, use an explicitly authorized new empty database ending in `_restore_<name>` and run `node scripts/backups.mjs restore path/to/identity.nxbackup`. Existing collections are rejected. Verify record counts, immutable IDs, indexes, ownership and role workflows through an isolated restored stack. The automated rehearsal verifies BSON IDs/dates/indexes and refusal to overwrite a target. It is not a measured full-stack production RPO/RTO rehearsal.

For rollback, stop writes/workers, preserve new data, restore a tested complete snapshot into new owner databases, point the previous compatible image versions at those databases, then run role/security smoke checks before restoring access. Roll back incompatible data changes with the paired migration strategy; reverting an image alone cannot undo data changes. Production storage retention and the institution's account-deletion/legal policy remain institution-specific configuration; account deletion currently deactivates access and queues retention review rather than erasing application/audit evidence.

## Release verification

Run the root check/test/build/audit/browser commands. Verify all five roles, privacy/ownership, hierarchy, graduation retention, duplicate applications/events, stale previews, dispatch history/cancellation, consent revocation, CV factuality/Unicode/long pages, migration and encrypted restore. Re-run `node scripts/performance.mjs` independently of other heavy workloads and record hardware/results. Staging release additionally requires live Gmail/Gemini acceptance, container startup, HTTPS/cookie checks, institution roster/scope/consent settings, user acceptance, rollback rehearsal and operational monitoring. Local measurements do not establish 99.9% production availability or a WCAG certification.

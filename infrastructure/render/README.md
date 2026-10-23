# Render deployment

Build each domain as a separate Docker private service using its owner Dockerfile and the repository root as build context. Deploy the gateway as a web service and the React build as a static site or the provided Nginx image behind HTTPS. Forward `/api/*` to the gateway under the same public origin; client cookies must remain host-only.

Set each service's own authenticated Atlas/replica-set URI, its service private key, the service public-key registry, the Identity public key and HTTPS service URL map through Render secrets. Only Identity receives its user-token signing/encryption keys; only Notification receives Gmail OAuth secrets; only CV receives the Gemini secret. `NODE_ENV=production` rejects HTTP origins or internal URLs. If private networking cannot provide internal TLS, configure verified TLS termination before release.

Start command: the service's Docker CMD. Health path: `/health/ready`. Service APIs and their durable workers run together initially. Choose paid capacity that does not suspend required workers. An API owner cannot run exclusively as a background worker.

Deploy to staging first; run the smoke, privacy, restore and rollback checklist in `docs/OPERATIONS.md`. No live deployment, subscription purchase or production credentials are included in this repository.

# Runtime topology

The gateway, seven services and frontend are separate deployable images. `compose.yaml` is a JSON-formatted YAML Compose definition for an authenticated local replica-set demonstration. Generate its ignored `.local/compose.env` and keys with `npm run setup`, then use the Compose command in `docs/OPERATIONS.md`.

Only the frontend is bound to `127.0.0.1:8080`; service and Mongo ports remain private to the Compose network. Each service receives its own database password and private signing key, plus required public keys. Identity alone receives user-token signing/encryption secrets; Notification alone receives Gmail secrets; CV alone receives Gemini secrets. The Mongo initialization container creates seven separate database users.

Local container networking uses HTTP for demonstration. Production configuration requires HTTPS for browser/internal service URLs, TLS database connections, managed secrets, health checks, encrypted backup storage and sufficient worker capacity. Consult `render/README.md` and `aws/README.md`. The implementation workstation had no Docker installation, so container builds/startup must be validated on a Docker host before release.

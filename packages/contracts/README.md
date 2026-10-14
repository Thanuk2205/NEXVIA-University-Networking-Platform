# API and event contracts

Run `npm run contracts` from the repository root to regenerate OpenAPI 3.1 JSON for each owner and the gateway under `openapi/`. `events.json` describes the durable envelope. Core role profile, opportunity, academic notice and CV request schemas are generated from the same Zod definitions used by services; other workflow inputs remain documented by their endpoint implementations and the implementation plan.

All successful public JSON replies use `{ data, meta: { requestId } }`; errors use `{ error: { code, message, requestId } }`. PDF export returns `application/pdf`. Collection routes use a bounded limit and opaque `(createdAt, _id)` cursor. Cookie-authenticated writes require a signed CSRF token and trusted Origin; repeat-sensitive commands require an Idempotency-Key. Profile/content/CV revision edits use If-Match. Administrator overrides of another author's content require X-Change-Reason and create audit evidence.

Internal service routes are intentionally private. They verify caller-specific short-lived RS256 service credentials and a permitted route/event allowlist. An actor JWT is independently verified where an action needs user authority. No cross-database model, populate or direct join is used.

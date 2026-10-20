# NEXVIA

Nexvia connects verified students, alumni, employers and university staff through career opportunities, academic guidance, community posts and factual CVs. The implementation follows `Docs/NEXVIA_MICROSERVICES_IMPLEMENTATION_PLAN.md` and its required submission scope.

The active application uses React web, Node.js/Express, MongoDB/Mongoose, asymmetric JWT sessions, Gmail API, Gemini and PDFKit. Seven independently running services own seven databases; an API gateway serves the browser. React Native, Firebase and Socket.io remain deferred.

**CV work deferred, 14 October 2026:** The existing CV baseline remains available. Further implementation will resume when requested. The [detailed CV implementation guide and LLM handover](../../Docs/NEXVIA_CV_IMPLEMENTATION_GUIDE.md) records current code, contracts, remaining gaps, phased work and acceptance checks for a future implementer.

## Run locally on Windows

For team setup and preparing a destination repository on `main`, see
[CONTRIBUTING.md](CONTRIBUTING.md). The PowerShell exporter is
[`scripts/prepare-main.ps1`](scripts/prepare-main.ps1).

Use Node 24 and PowerShell from this repository directory. Dependencies are already installed in this workspace. On another machine run `npm ci` first.

```powershell
npm run setup
npm run dev
```

Open **http://localhost:5173**. The gateway runs on port 5000. The development runner starts an authenticated MongoDB replica set on port 27027 using the installed MongoDB binary; if none is installed, the test tooling downloads one. Local data persists in `.local/mongo`. Stop the stack with Ctrl+C before restarting it.

MongoDB startup allows two minutes for Windows disk and journal recovery. If you previously saw `Instance failed to start within 10000ms`, run `npm run dev` again with the updated launcher. For an unusually slow startup, set a longer budget in PowerShell before starting:

```powershell
$env:NEXVIA_MONGO_STARTUP_TIMEOUT_MS = "180000"
npm run dev
```

Keep `.local/mongo` and `.local/mongo-secrets.json`; they contain the saved database and its authentication credentials. Only run one development stack at a time.

If startup reports `DBPathInUse`, `mongod.lock`, or `Local MongoDB port 27027 is already in use`, check **http://localhost:5173** first: a previous stack may still be running. To restart, press **Ctrl+C in the terminal running that stack**, wait for it to exit, then run `npm run dev` once. The launcher checks for an occupied MongoDB port before opening the database. Do not delete database lock files while MongoDB is running.

For `Untrusted request origin.`, open **http://localhost:5173** and sign in there. The browser address must match `CLIENT_ORIGIN` in the root `.env`, including its port. The development server redirects browser page visits from a loopback alias such as `127.0.0.1` to the configured address and fails if port 5173 is occupied. After changing `.env`, restart the stack with Ctrl+C and `npm run dev`.

In a second terminal, create the synthetic demonstration accounts:

```powershell
npm run seed:demo
```

Accounts: `student@demo.example`, `alumni@demo.example`, `employer@demo.example`, `faculty@demo.example`, `admin@demo.example`. Their generated password is in **`.local/demo-password.txt`**. These explicitly approved demonstration users and academic labels are synthetic. Seeding sends no email. Seed again safely without replacing existing users or records.

New registrations require email ownership verification and a separate administrator review. Configure Gmail before testing actual verification/recovery email delivery. The persistent inbox, deterministic matching and template CV generation work without external provider credentials.

## Implemented workflows

- All five roles: registration, staff invitations, protected sessions, recovery, approval/suspension and account deactivation.
- Shared dashboard feed for all approved roles, job referrals, private uploaded-PDF applications to the post author, author review and applicant withdrawal. See [network feed and referral workflow](docs/NETWORK_FEED.md).
- Exact role profiles, academic taxonomy/membership review, separate matching/CV/discovery completion checklists, visibility selections and explicit discovery consent.
- Same-account student-to-alumni approval, faculty recommendations and retained profile, post, CV and application history.
- One approved recruiter per organization; independent consent-based candidate search and vacancy recommendations.
- Owned opportunity drafts, publication, editing, closing, deadlines, employer applications, immutable submission snapshots and status history. University opportunities use external links or information-only publication.
- Academic notices with ownership, scope, revisions, expiry and archiving; dispatch preview/confirmation/cancellation, persisted history and delivery progress.
- Persistent recipient inbox/read state, preferences, Gmail retries and evidence-based handling of uncertain sends.
- Community posting, author edits/deletion, reports/moderation and an opt-in alumni directory.
- Private asynchronous CV drafts, consented Gemini assistance, editable reviewed revisions and Unicode PDF export.
- Actual role dashboard counts, service health, durable outbox/inbox events, admin audit/recovery tools, API contracts, tests, encrypted backup/restore and rerunnable legacy migration.

## Repository

| Location                                     | Purpose                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `apps/api-gateway`                           | Public REST gateway; no domain database                               |
| `services/identity-service`                  | Accounts, sessions, verification/recovery and staff invitations       |
| `services/profile-service`                   | Profiles, taxonomy, membership, graduation and employer organizations |
| `services/opportunity-service`               | Opportunities, academic notices and internal employer applications    |
| `services/matching-dispatch-service`         | Explainable matching and durable scoped dispatch                      |
| `services/community-service`                 | Posts, reports and moderation                                         |
| `services/notification-service`              | Inbox, preferences and Gmail delivery                                 |
| `services/cv-service`                        | CV generation, revisions and PDFKit export                            |
| `packages/platform-utils`                    | Authentication, validation, service lifecycle and reliability helpers |
| `packages/contracts`                         | Generated OpenAPI 3.1 contracts and event schemas                     |
| `frontend/src/features`                      | Active React pages and role journeys                                  |
| `scripts`, `tests`, `infrastructure`, `docs` | Development, verification, deployment and operations                  |

`backend/` and the old `frontend/src/pages`/`components` files retain the earlier prototype for migration/reference. Root scripts launch only the new services and active React features. Use the **root package-lock.json** and root npm commands.

## Verification

```powershell
npm run check
npm test
npm run build
npm audit --audit-level=moderate
npx playwright install chromium
npm run test:e2e
npm run contracts
```

The automated tests use isolated authenticated MongoDB instances and synthetic accounts. Browser tests exercise real service boundaries with a fake Gmail provider. Real Gmail/Gemini acceptance and production deployment require configured accounts and staging verification.

Read [implementation status](docs/IMPLEMENTATION_STATUS.md), [configuration and recovery](docs/OPERATIONS.md), [role walkthroughs](docs/USER_GUIDE.md), and [measured performance](docs/PERFORMANCE_RESULTS.json). Container and Render/AWS deployment instructions are in `infrastructure/`. Docker is unavailable on this workstation, so local image builds and a hosted deployment have not been validated.

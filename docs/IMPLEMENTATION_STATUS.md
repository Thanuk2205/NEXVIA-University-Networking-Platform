# Nexvia implementation status

Implemented on **8 October 2026** from `C:/Users/Thisuri S_/Desktop/Group_Project/Docs/NEXVIA_MICROSERVICES_IMPLEMENTATION_PLAN.md` in `C:/Users/Thisuri S_/Desktop/Group_Project/NEXVIA-project/nexvia`.

The required React web application and seven owner services are implemented and run locally with an API gateway. Local tests exercise real HTTP boundaries and authenticated, separate MongoDB credentials. External provider acceptance, container startup and production release remain staging work; no hosted deployment or live email was performed.

## Required feature traceability

| Plan ID  | Required for submission                  | Implementation                                                                                                                                                                                                |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01/02 | Account lifecycle and all five roles     | Identity; signed cookie sessions/CSRF, refresh rotation/replay revocation, verification/recovery, invitations, review and resource-owner guards                                                               |
| FR-03/04 | Academic mapping and exact profiles      | Profile; active hierarchy validation, membership review, bounded role schemas, selected visibility and completion checklists                                                                                  |
| FR-05/06 | Opportunities and applications           | Opportunity; create/publish/edit/close/deadlines, unique consented applications, immutable submitted facts, status transitions and external university applications                                           |
| FR-07/08 | Recommendations and explanations         | Matching; hard eligibility, normalized 70/20/10 preferred scoring, unranked no-preference state, selected visible candidate facts and detailed explanations                                                   |
| FR-09/10 | Scoped dispatch, Gmail and inbox         | Matching/Notification; preview/revalidate/freeze/cancel, persisted history/progress, owner read state, preferences, durable individual email jobs and audited unknown outcome reconciliation                  |
| FR-11/13 | Community and alumni guidance            | Community/Profile; owned posts, reports/moderation, consented alumni directory and guidance interest                                                                                                          |
| FR-12    | Editable factual CV/PDF                  | CV; asynchronous jobs, per-job AI/email consent, factual Gemini-assisted summary selection, template fallback, reviewed revisions, owner authorization and paginated Unicode PDFs                             |
| FR-14/15 | Administration, dashboards and React web | Reviewed queues, taxonomy/staff invitations, actual scoped counts, all role journeys, semantic labels/focus/status, responsive phone/desktop layout                                                           |
| FR-16    | Independent services and operations      | Seven databases/processes, private service JWT allowlists, transactional outbox/inbox, owner audit/retry tools, generated OpenAPI/event contracts, Docker/Compose/CI, migration and encrypted restore scripts |
| FR-17    | Same-account graduation                  | Scoped faculty recommendation and final admin institutional approval; same account ID retains profile/posts/CVs/applications; previous sessions revoked                                                       |
| FR-18    | Separate employer candidate search       | Dedicated screen/API; active approved recruiter and organization; explicit consent and field allowlists; current revocation honored on reads                                                                  |
| FR-19    | Standalone academic notices              | Opportunity-owned collection with draft/publish/edit/expiry/archive APIs, current scope checks and revision-fixed dispatch                                                                                    |
| FR-20    | Organization ownership                   | One primary recruiter per organization, immutable ownership, organization review/suspension and fresh approval checks for publishing/search/applications                                                      |

Gmail and Gemini adapters are complete but require configured operator credentials for actual provider acceptance. The existing `.env.example` leaves those secrets empty. The Gmail inbox history works independently of email delivery, and CV template generation works independently of Gemini.

## Later enhancements retained outside submission scope

React Native, Firebase/FCM and Socket.io remain deferred/on hold pending the user's explicit confirmation. Multi-recruiter organizations and ownership transfer, comments/reactions, saved opportunities, uploads, private mentoring/chat, AI candidate ranking, advanced reporting and an external event broker are later enhancements. None is required by the active application.

## Deliberate implementation choices

- Gemini selects validated indices into already factual career sentences. This limits hallucinations more strictly than accepting a freely generated summary. The user can edit and must review the final CV. Contact details/registration numbers stay outside model input.
- Public/private disclosure always uses current owner policy; cached recommendation results contain only IDs/scores and are revalidated before display. Refusing discovery does not block private personal recommendations or CV generation.
- Pending/unverified accounts have onboarding/profile/preferences access; publication/application/community/discovery require full approval.
- Graduation approval is an asynchronous same-ID role change tracked in the request record. It does not create another account or migrate history to a new ID.
- Account deletion disables access and queues retention review. Institution-specific retention deadlines and erasure policy need institutional confirmation before a production purge routine is defined.
- Administrator content overrides require an audited reason header. Unknown Gmail outcomes need operator evidence before retry/acceptance recording.
- Root npm scripts exclude the archived backend. Existing prototype source is retained for review/migration, and new databases are not connected to prototype routes.

## Verification and practical limits

**Final local verification:** 32 domain/service/migration/recovery/persistence tests and five Chromium browser journeys pass. `VALIDATION_RESULTS.json` records the environment and remaining external checks.

The automated suite covers domain rules, private records/mass assignment, service identity, approval separation, consent revocation, duplicate applications/events, current organization suspension, external university methods, scope, stale previews/cancellation/history, recipient ownership, profile version conflicts, refresh replay/key overlap, legacy bcrypt upgrade, factual CV ownership/review, Sinhala/Tamil font embedding and long PDFs, graduation history, encrypted BSON/index restore, cross-database denial and rerunnable synthetic legacy migration. Browser tests exercise student CV/profile/session renewal/mobile sign-out, separate employer candidate search, faculty notices/dispatch history, owned vacancy editing and administrator screens.

Run the root verification commands in README.md for the current exact test totals. Syntax/build/audit checks pass and the active workspace dependency audit reports zero vulnerabilities. Real providers are replaced with a fake Gmail adapter in service/browser tests; live Gmail/Gemini acceptance is still required.

`PERFORMANCE_RESULTS.json` records a local Windows/Node 24 run on an i5-1335U with 8 GiB RAM, 5,000 synthetic profiles and 100 concurrent authenticated reads. Top-20 matching completed in approximately **1.8 seconds** and a **1,000-recipient** dispatch persisted in approximately **46 seconds**, meeting their proposed local timing targets. The tested opportunity-list read had **p95 approximately 1.45 seconds**, exceeding the proposed **500 ms** target. The harness runs all services/client/Mongo on one host and service logic in one Node process; repeat on separately provisioned staging services and tune request/process/database capacity before claiming the API performance target. Do not extrapolate this one-route benchmark to every API.

Docker is absent on this machine, so image builds/Compose startup were not executed locally. CI contains image builds; its remote run has not been triggered here. Render/AWS hosting instructions and TLS/secret boundaries are provided, but no resources were provisioned. Backup tests verify encrypted logical recovery into an empty target; full-stack staging rollback and measured production RPO/RTO remain release acceptance. Responsive/label/keyboard-friendly implementation and browser evidence are provided; full WCAG 2.2 AA audit and institutional UAT remain release checks. No local result establishes 99.9% production availability.

## Handover

**14 October 2026 — shared dashboard feed:** All approved roles can publish career updates/job referrals. Students/alumni apply using an existing uploaded PDF, with explicit private disclosure to the post author. Community owns the files and application snapshots; author review, applicant tracking/withdrawal, role restrictions, quotas, expiration, moderation and account-deletion handling are documented in [NETWORK_FEED.md](NETWORK_FEED.md). This extends community referrals while CV generation work remains deferred. The historical validation totals above predate this feature; use the current test run for exact counts.

The feed delivery passed 40 automated tests and six Chromium journeys, with the six dedicated feed service tests repeated after final response-field privacy changes. Build, syntax checks, contracts and the zero-vulnerability dependency audit pass. Evidence is recorded in [NETWORK_FEED_VALIDATION.json](NETWORK_FEED_VALIDATION.json).

Run `npm run dev` and open http://localhost:5173. `npm run seed:demo` creates the synthetic role accounts; their generated password is stored privately in `.local/demo-password.txt`. Read `USER_GUIDE.md` for role walkthroughs and `OPERATIONS.md` for credentials, provider setup, administrator provisioning, TLS deployment, migration, key rotation, backup/restore and rollback.

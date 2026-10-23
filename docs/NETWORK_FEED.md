# Shared dashboard feed and job referrals

Implemented for the user's dashboard request on 14 October 2026. The user selected **applications to the post author** and **uploading an existing PDF CV**. CV generation remains deferred; this workflow does not call the CV generator or require a saved Nexvia CV.

## User workflow

All active, email-verified and institutionally approved roles can use the Network feed: student, alumni, employer, faculty and administrator. The dashboard and Community route use the same feed component and newest-first post collection. Filter by all posts, job referrals or updates, refresh, and load further pages.

Use **Post type → Career update** for ordinary posts. Choose **Job referral** to include a job title, company, employment type, optional location and optional deadline. A company name entered in a referral is not institutional verification of that company. Authors can edit/delete their posts and close applications. Reported content remains subject to administrator moderation.

Students and alumni can apply to another member's open job referral by uploading a PDF CV up to 2 MiB, optionally providing an email/message, and explicitly consenting to disclosure to the named author. No matching-ready profile or discovery opt-in is required for a referral; a saved name and approved account are required. The author's role does not grant access to any other candidate's private CV.

The prominent **Apply with a PDF CV** control expands the private application form. It appears on another member's open Job referral when signed in as a student/alumnus. Own posts explain that others can apply; staff/employer accounts explain the learner role requirement; closed/expired referrals show their reason. A backend response without application status shows temporary unavailability, rather than falsely labelling the job closed. If the frontend was refreshed while an older development backend remained running, restart the development stack to load the new API.

**Post applications** shows only applications to the current user's own posts. Download the submitted CV, record a reason, and move a submitted application to reviewing, forwarded or declined. Reviewing can become forwarded or declined. “Forwarded” records the author's own referral action; Nexvia does not email the CV to a company automatically or claim that a referral is a hiring decision.

**My applications** combines referral tracking with the existing separate official-vacancy application section. Applicants can withdraw submitted, reviewing or forwarded referrals. Withdrawal removes the author's future download access and hides the private contact/message in the author response; it cannot recall a file already downloaded. The applicant retains their own download/history access while their account remains active.

Official employer vacancies retain their existing organization approval, eligibility and application rules. Official university opportunities retain external/information-only application methods. Community job referrals are a separate consented introduction workflow available to all approved members, including faculty.

## Service ownership and files

Community owns `posts`, `post_applications`, `post_cv_files` and `post_owner_states` in `nexvia_community`. It calls Identity for current account state and Profile's allowlisted owner snapshot API for the applicant's name and source version. Other private profile fields are excluded from the application snapshot. There are no cross-service database queries. No Gemini call, Firebase, Socket.io or third-party file-sharing service is introduced.

PDF bodies travel through the gateway to Community as `application/pdf`, with a 2 MiB limit at both boundaries. The existing 100 KiB JSON limit remains on JSON requests. The server verifies a PDF header and end marker and rejects path-bearing/non-PDF filenames; this is bounded format validation, not an antivirus scan or full PDF conformance check. Files are downloaded as attachments with a fixed server filename and existing no-store/security headers. The browser uses the original validated filename for its download action.

Small PDFs are stored in an owner database binary field, separate from list/document metadata. The five unused-upload slots are protected by a unique index, including under simultaneous uploads. Unsubmitted files expire after one hour through a TTL index; submitted files are bound to one application and lose their temporary expiry/slot. An upload can be attached only by its owner and only once. Idempotent upload retries return the same ID; different bytes/filename with the same key conflict.

Submission atomically binds the file, stores immutable job/name/message/contact snapshots, records consent and appends a completion event to Community's outbox. It also writes the current post to serialize against closure, edits, deletion and moderation. Each applicant can submit at most one application per post. The post revision and deadline are rechecked; an old form cannot silently apply to changed/closed content.

Only the applicant or that application's post author can download its PDF. Admin status alone does not grant access. There is no public file URL or independent upload-download route. Lists never include binary content. Referral reviews use revision checks and audit records. Status events use the existing durable Notification inbox and application email preferences; tests use a fake email provider.

Account deletion writes an owner-local marker in the same transaction as file erasure and application redaction. Upload and application writes serialize on that marker, so an earlier authorization check cannot recreate deleted data after the deletion event. Minimal application status/history remains, while CV files, contact, message and profile snapshot are removed for the deleted applicant. Institution-specific retention periods still require an approved policy.

## Public API

All APIs use existing cookie sessions/current account checks. Writes require the trusted Origin and signed CSRF proof. Upload and application submission require an Idempotency-Key. Review PATCH also requires If-Match with the application's current revision.

| Endpoint                                                      | Purpose                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/posts?type=all\|job\|update&limit=20&cursor=...` | Newest-first shared feed; adds only the viewer's own application status        |
| `POST /api/v1/posts`                                          | Create an update/job referral, author and role taken from the session          |
| `PATCH /api/v1/posts/:id`                                     | Author edit using current post If-Match; post type is immutable                |
| `DELETE /api/v1/posts/:id`                                    | Author soft deletion                                                           |
| `POST /api/v1/posts/:id/close`                                | Author closes a published job referral                                         |
| `POST /api/v1/post-cv-uploads`                                | Raw PDF; URI-encoded `X-CV-Filename`; returns uploadId/filename/size           |
| `POST /api/v1/posts/:id/applications`                         | Consent, current postRevision, owned cvUploadId, optional message/contactEmail |
| `GET /api/v1/post-applications?view=sent\|received`           | Private paginated applicant or author history                                  |
| `GET /api/v1/post-applications/:id/cv`                        | Authorized attachment download                                                 |
| `PATCH /api/v1/post-applications/:id/status`                  | Author review with status/reason and If-Match                                  |
| `POST /api/v1/post-applications/:id/withdraw`                 | Applicant withdrawal and author download revocation                            |

Job post payload:

```json
{
  "postType": "job",
  "body": "I know of this opening and can help with an introduction.",
  "tags": [],
  "job": {
    "title": "Software engineering internship",
    "company": "Example Company",
    "employmentType": "internship",
    "location": "Colombo"
  }
}
```

Application payload, after uploading the PDF:

```json
{
  "postRevision": 1,
  "cvUploadId": "0123456789abcdef01234567",
  "consent": true,
  "message": "Please consider me for a referral.",
  "contactEmail": "applicant@example.com"
}
```

The owner-entered contact email is not labelled as independently verified. The uploaded PDF and selected contact/message are shared only after explicit submission consent.

## Source and operation

Validation: the full automated suite passed 40 tests, and six Chromium journeys passed. The six dedicated feed tests were repeated after final response-field privacy changes and passed. Syntax/secret-pattern checks, production build and contract generation pass; the active dependency audit reports zero vulnerabilities. See [recorded validation](NETWORK_FEED_VALIDATION.json). Provider tests use synthetic data and a fake Gmail adapter.

- `frontend/src/features/feed.jsx`: dashboard, composer, PDF application form and author/applicant tracking cards.
- `services/community-service/src/domain.js`: post/job/application schemas and referral transitions.
- `services/community-service/src/applications.js`: private files, owner serialization, submission, review, withdrawal and download APIs.
- `services/community-service/src/app.js`: post lifecycle, filter, owner status enrichment, moderation and deletion event handling.
- Gateway: Community routing, bounded binary upload parsing and safe header/body forwarding.
- Profile: Community is allowlisted for the existing authenticated owner-snapshot API.
- Notification: `PostApplicationSubmitted.v1` and `PostApplicationStatusChanged.v1`; typed private resource links.
- `scripts/contracts.mjs`: authoritative generator for updated OpenAPI/events.
- `tests/feed.test.mjs`: role/filter, private PDF, idempotency, consent, moderation/closure/deadline, quota, review/withdrawal and deletion checks.
- `tests/browser/portals.spec.js`: alumni posting → student PDF application → author download/review → applicant withdrawal, including responsive layout.

Restart an already running stack with Ctrl+C followed by `npm run dev` to load backend changes. Run `npm run seed:demo` in a second terminal to add five synthetic posts (including four job referrals). Seeds use stable IDs and preserve existing edited records. MongoDB stores the uploaded files privately; apply normal owner-database backup/encryption/retention controls. For a materially larger deployment, evaluate dedicated object storage/streaming and a malware-scanning pipeline as a separate operational change.

# Role walkthroughs

Use `npm run dev` and `npm run seed:demo` for the demonstration. Sign in with a listed `@demo.example` account and the generated password in `.local/demo-password.txt`.

## Shared dashboard and job referrals

Network feed shows posts from all approved roles. Publish a Career update or Job referral with company/title/type and optional location/deadline. Students, alumni, employers, faculty and administrators can all post. Use the filters, Refresh feed and Load more to browse.

Students/alumni can open **Apply with a PDF CV**, upload an existing PDF up to 2 MB, add an optional contact/message and consent to share with the named post author. CV generation and candidate discovery are not needed for this referral flow. Track/withdraw through **My applications**. All authors use **Post applications** to privately download received CVs and record reviewing, forwarded or declined status with a note. Closing/deleting/moderating/expiring a job post stops new applications. A company name in a community referral is not a verified employer vacancy. See [full workflow and permissions](NETWORK_FEED.md).

## Student

Open My profile, complete the controlled academic hierarchy and career facts, save, and use the matching/CV/discovery checklists. New users submit membership evidence for administrator review and verify their email separately. Reviewed academic identifiers require a new membership request to change.

Opportunity recommendations work with your private saved profile even when employer discovery is disabled. “Why this opportunity matches you” separates mandatory eligibility from preferred criteria and shows matched/missing evidence. Enable discovery only after selecting the career fields you want recruiters to see.

Apply to an internal employer vacancy after giving submission consent. Attach a reviewed CV if desired. The application retains that submitted profile/CV revision. Track changes or withdraw through My applications. External university opportunities open their published application website; Nexvia does not track that external outcome.

In CV studio, choose template mode or explicitly consent to Gemini processing, then generate and refresh the job status. Edit the factual draft, confirm its accuracy, save a reviewed revision and download the PDF. Earlier revisions remain accessible.

Create or edit your own community posts; report inappropriate posts. Read academic notices and recipient updates in My inbox. Email preferences are separate from persisted inbox records.

When graduating, request graduation review using the recorded degree, cohort and claimed year. Faculty may recommend; an administrator verifies institutional evidence. Sign in again when the role changes. The same account retains profiles, posts, CVs and application history.

## Alumni

Complete roster membership and verified graduation details. Opt into the alumni directory and select the fields to share. Optional mentoring interest means willingness to share community guidance; private mentoring/chat is deferred. Explore eligible opportunities, maintain CVs and retain your earlier applications.

## Employer

Complete your recruiter profile and organization details. An administrator verifies the organization and account. One approved recruiter owns that organization in this release.

Use Find candidates for independent consent-based filtering by role, degree and skills. Private contacts and CVs are excluded from discovery. Publish your vacancy from My vacancies after specifying mandatory and preferred requirements. Edit active content with revision checks or close it. Review submitted application snapshots and record reasons when shortlisting, rejecting or hiring. Candidate recommendations remain separate from applications.

## Faculty

Accept an administrator-issued invitation, verify email, complete staff details and obtain institutional approval. Your assigned academic scope controls publication, graduation recommendations and dispatch.

Create university opportunities using an external application URL or information-only method. Create/edit/publish/archive academic notices. In Dispatch guidance, select published content, narrow the audience, preview recipients and confirm. Reload the page and use Your dispatch history to check progress or cancel pending recipients. Already handed-off work and accepted email cannot be recalled.

## Administrator

Review academic membership using institutional evidence, approve organizations, then independently review account email/approval. Manage academic taxonomy and faculty invitations. Give final graduation decisions with year, evidence reference and reason. Moderate reported community posts with an auditable reason.

The delivery recovery panel shows unresolved Gmail jobs, durable service events and audit history. Verify evidence before resolving an unknown send. Recording provider acceptance requires a provider message ID; requeue only after confirming the message was not sent. Service event retries retain their original event identity.

Use the protected administrator provisioning script for the first real administrator; demonstration accounts must not become production accounts. Operational commands are in OPERATIONS.md.

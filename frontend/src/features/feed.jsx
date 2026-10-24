import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import {
  useResource,
  useAction,
  Title,
  State,
  Field,
  Flash,
  Empty,
  Pager,
  Checklist,
} from "./shared";

const initials = (name = "Nexvia") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
const emptyJob = {
  title: "",
  company: "",
  location: "",
  employmentType: "internship",
  deadline: "",
};
const roleLabels = {
  student: "Student",
  alumni: "Alumni",
  employer: "Employer",
  faculty: "Faculty",
  admin: "Administrator",
};

function PostComposer({ user, profile, editing, onSaved, onCancel }) {
  const action = useAction();
  const [type, setType] = useState(editing?.postType || "update");
  const [body, setBody] = useState(editing?.body || "");
  const [job, setJob] = useState(() => {
    if (!editing?.job) return { ...emptyJob };
    const d = editing.job.deadline && new Date(editing.job.deadline);
    return {
      ...emptyJob,
      ...editing.job,
      deadline: d
        ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "",
    };
  });
  return (
    <section className="card feed-composer">
      <div className="feed-author">
        <span className="feed-avatar">{initials(profile?.fullName)}</span>
        <div>
          <h2>{editing ? "Edit your post" : "Share with your network"}</h2>
          <p className="muted">Career updates, useful openings and referrals</p>
        </div>
      </div>
      <Flash error={action.error} message={action.message} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.run(
            async () => {
              const payload = {
                body,
                tags: editing?.tags || [],
                postType: type,
                ...(type === "job"
                  ? {
                      job: {
                        title: job.title,
                        company: job.company,
                        employmentType: job.employmentType,
                        ...(job.location ? { location: job.location } : {}),
                        ...(job.deadline
                          ? { deadline: new Date(job.deadline).toISOString() }
                          : {}),
                      },
                    }
                  : {}),
              };
              if (editing)
                await api.patch(`/posts/${editing._id}`, payload, {
                  headers: { "If-Match": editing.revision },
                });
              else await api.post("/posts", payload);
              setBody("");
              setType("update");
              setJob({ ...emptyJob });
              await onSaved();
            },
            editing ? "Post updated." : "Post shared with your network.",
          );
        }}
      >
        <Field label="Post type">
          <select
            value={type}
            disabled={!!editing}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="update">Career update</option>
            <option value="job">Job referral</option>
          </select>
        </Field>
        <Field label="Post">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={5000}
            rows={4}
            placeholder={`What would you like to share, ${profile?.fullName?.split(" ")[0] || "today"}?`}
          />
        </Field>
        {type === "job" && (
          <fieldset className="job-fields">
            <legend>Job referral details</legend>
            <div className="form-grid">
              <Field label="Job title">
                <input
                  value={job.title}
                  onChange={(e) => setJob({ ...job, title: e.target.value })}
                  minLength={3}
                  maxLength={160}
                  required
                />
              </Field>
              <Field label="Company">
                <input
                  value={job.company}
                  onChange={(e) => setJob({ ...job, company: e.target.value })}
                  minLength={2}
                  maxLength={160}
                  required
                />
              </Field>
              <Field label="Location (optional)">
                <input
                  value={job.location || ""}
                  onChange={(e) => setJob({ ...job, location: e.target.value })}
                  maxLength={160}
                />
              </Field>
              <Field label="Employment type">
                <select
                  value={job.employmentType}
                  onChange={(e) =>
                    setJob({ ...job, employmentType: e.target.value })
                  }
                >
                  {["internship", "full-time", "part-time", "contract"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Application deadline (optional)">
                <input
                  type="datetime-local"
                  value={job.deadline || ""}
                  onChange={(e) => setJob({ ...job, deadline: e.target.value })}
                />
              </Field>
            </div>
            <p className="muted">
              Applications and uploaded CVs are sent privately to you for this
              referral. Sharing an opening does not verify the company or make
              you its recruiter.
            </p>
          </fieldset>
        )}
        <div className="actions">
          <span className="muted">Posting as {roleLabels[user.role]}</span>
          <button disabled={action.busy}>
            {editing ? "Save post" : "Publish post"}
          </button>
          {editing && (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function ApplyToPost({ post, onApplied }) {
  const { user } = useAuth();
  const action = useAction();
  const [file, setFile] = useState(null),
    [fileError, setFileError] = useState("");
  const [upload, setUpload] = useState(null),
    [message, setMessage] = useState("");
  const [contact, setContact] = useState(user.email || ""),
    [consent, setConsent] = useState(false);
  return (
    <details className="feed-apply">
      <summary className="feed-apply-trigger">Apply with a PDF CV</summary>
      <p>
        This application goes to <strong>{post.authorName}</strong>, who can
        help with the referral. It is not an application sent directly to the
        company.
      </p>
      <Flash error={fileError || action.error} message={action.message} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.run(async () => {
            let selected = upload;
            if (!selected) {
              const response = await api.post("/post-cv-uploads", file, {
                headers: {
                  "Content-Type": "application/pdf",
                  "X-CV-Filename": encodeURIComponent(file.name),
                },
              });
              selected = response.data.data;
              setUpload(selected);
            }
            try {
              await api.post(`/posts/${post._id}/applications`, {
                postRevision: post.revision,
                cvUploadId: selected.uploadId,
                consent: true,
                message,
                ...(contact ? { contactEmail: contact } : {}),
              });
            } catch (error) {
              if (error.response?.data?.error?.code === "CV_UPLOAD")
                setUpload(null);
              throw error;
            }
            await onApplied();
          }, "Application sent privately to the post author.");
        }}
      >
        <Field
          label="PDF CV"
          hint="Upload an existing PDF, up to 2 MB. CV generation is not required."
        >
          <input
            type="file"
            accept=".pdf,application/pdf"
            required
            onChange={(e) => {
              const f = e.target.files?.[0];
              setUpload(null);
              setFile(null);
              setFileError("");
              if (f && (!/\.pdf$/i.test(f.name) || f.size > 2 * 1024 * 1024))
                setFileError("Choose a PDF CV no larger than 2 MB.");
              else setFile(f || null);
            }}
          />
        </Field>
        <Field label="Contact email (optional, shared with the author)">
          <input
            type="email"
            maxLength={254}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </Field>
        <Field label="Message to the post author (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          I agree to share my uploaded CV, name, message and optional contact
          email with {post.authorName} for this referral.
        </label>
        <button disabled={action.busy || !file || !consent || !!fileError}>
          Send application
        </button>
      </form>
    </details>
  );
}

function FeedPost({ post: p, user, onEdit, reload }) {
  const action = useAction(),
    [reason, setReason] = useState("");
  const own = p.authorId === user.userId,
    learner = ["student", "alumni"].includes(user.role);
  const applicationStatusKnown = typeof p.acceptingApplications === "boolean";
  return (
    <article className="card feed-post" aria-label={`Post by ${p.authorName}`}>
      <header className="feed-author">
        <span className={`feed-avatar avatar-${p.authorRole || "member"}`}>
          {initials(p.authorName)}
        </span>
        <div>
          <strong>{p.authorName}</strong>
          <p className="muted">
            {roleLabels[p.authorRole] || "University member"} ·{" "}
            {new Date(p.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="feed-kind">
          {p.postType === "job" ? "Job referral" : "Update"}
        </span>
      </header>
      <p className="preserve feed-post-body">{p.body}</p>
      {p.postType === "job" && (
        <section className="feed-job">
          <div className="feed-job-heading">
            <span className="job-icon" aria-hidden="true">
              ↗
            </span>
            <div>
              <h3>{p.job.title}</h3>
              <p>{p.job.company}</p>
            </div>
            <span
              className={`badge ${p.acceptingApplications ? "job-open" : "job-closed"}`}
            >
              {!applicationStatusKnown
                ? "Application status unavailable"
                : p.acceptingApplications
                  ? "Accepting applications"
                  : "Applications closed"}
            </span>
          </div>
          <p className="muted">
            {[p.job.employmentType, p.job.location].filter(Boolean).join(" · ")}
          </p>
          {p.job.deadline && (
            <p className="muted">
              Deadline: {new Date(p.job.deadline).toLocaleString()}
            </p>
          )}
          <p className="referral-note">
            Shared by a community member. Your CV is visible only to you and
            this post's author when you apply.
          </p>
          {p.myApplication ? (
            <p className="notice">
              Your application: <strong>{p.myApplication.status}</strong> ·{" "}
              <Link to="/applications">View your applications</Link>
            </p>
          ) : own ? (
            <p className="referral-note">
              You shared this referral. Other students and alumni can apply to
              it.
            </p>
          ) : !learner ? (
            <p className="referral-note">
              Applications are available to student and alumni accounts.
            </p>
          ) : !applicationStatusKnown ? (
            <p className="notice" role="status">
              Application status is currently unavailable. Refresh the feed or
              try again shortly.
            </p>
          ) : p.acceptingApplications ? (
            <ApplyToPost post={p} onApplied={reload} />
          ) : (
            <p className="referral-note">
              This referral is closed or its application deadline has passed.
            </p>
          )}
          {own && (
            <Link to="/post-applications">
              Review applications to your posts →
            </Link>
          )}
        </section>
      )}
      {!!p.tags?.length && (
        <p className="feed-tags">{p.tags.map((t) => `#${t}`).join(" ")}</p>
      )}
      <Flash error={action.error} message={action.message} />
      <div className="feed-post-actions">
        {own && (
          <>
            <button className="secondary" onClick={() => onEdit(p)}>
              Edit post
            </button>
            {p.postType === "job" && p.jobStatus === "open" && (
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api.post(`/posts/${p._id}/close`, {});
                    await reload();
                  }, "Applications closed.")
                }
              >
                Close applications
              </button>
            )}
            <button
              className="secondary danger-text"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await api.delete(`/posts/${p._id}`);
                  await reload();
                }, "Post deleted.")
              }
            >
              Delete post
            </button>
          </>
        )}
        <details className="feed-report">
          <summary>Report post</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(
                () => api.post(`/posts/${p._id}/reports`, { reason }),
                "Report submitted for moderation.",
              );
            }}
          >
            <Field label="Reason for reporting">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={1000}
                required
              />
            </Field>
            <button disabled={action.busy}>Submit report</button>
          </form>
        </details>
      </div>
    </article>
  );
}

export default function FeedDashboard() {
  const { user } = useAuth();
  const approved = user.emailVerified && user.approvalStatus === "approved";
  const profile = useResource("/profiles/me"),
    completion = useResource("/profiles/me/completion");
  const [filter, setFilter] = useState("all"),
    [editing, setEditing] = useState(null);
  const feed = useResource(approved ? `/posts?type=${filter}` : null);
  const summary = useResource(approved ? `/dashboards/${user.role}` : null);
  const composer = useRef(null);
  return (
    <div className="page feed-dashboard">
      <Title title={`Welcome, ${profile.data?.fullName || "Nexvia member"}`}>
        Your university network. Share an opening, find a referral, or take your
        next step.
      </Title>
      {!approved ? (
        <>
          <p className="notice">
            Verify your email and complete institutional approval to join the
            shared feed.
          </p>
          <State resource={completion}>
            <Checklist data={completion.data} />
          </State>
        </>
      ) : (
        <div className="feed-layout">
          <div className="feed-main">
            <div ref={composer} className="composer-anchor">
              <PostComposer
                key={editing?._id || "new"}
                user={user}
                profile={profile.data}
                editing={editing}
                onCancel={() => setEditing(null)}
                onSaved={async () => {
                  setEditing(null);
                  await feed.reload();
                }}
              />
            </div>
            <div className="feed-toolbar">
              <div className="feed-filters" aria-label="Filter posts">
                {[
                  ["all", "All posts"],
                  ["job", "Job referrals"],
                  ["update", "Updates"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className="secondary"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button className="secondary" onClick={feed.reload}>
                Refresh feed
              </button>
            </div>
            <State resource={feed}>
              {feed.data?.items.length ? (
                feed.data.items.map((p) => (
                  <FeedPost
                    key={p._id}
                    post={p}
                    user={user}
                    reload={feed.reload}
                    onEdit={(post) => {
                      setEditing(post);
                      composer.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  />
                ))
              ) : (
                <Empty>
                  No posts here yet. Share an update or a useful job opening.
                </Empty>
              )}
              <Pager resource={feed} url={`/posts?type=${filter}`} />
            </State>
          </div>
          <aside className="feed-side" aria-label="Your network shortcuts">
            <section className="card feed-profile-card">
              <div className="feed-profile-cover" />
              <span className="feed-avatar large">
                {initials(profile.data?.fullName)}
              </span>
              <h2>{profile.data?.fullName || "Your profile"}</h2>
              <span className="badge">{roleLabels[user.role]}</span>
              <p>
                {profile.data?.headline ||
                  "Keep your profile current and connect with your university network."}
              </p>
              <Link to="/profile">View your profile →</Link>
            </section>
            <section className="card feed-shortcuts">
              <h2>Your next step</h2>
              <Link to="/post-applications">Applications to your posts</Link>
              {["student", "alumni"].includes(user.role) && (
                <Link to="/applications">Your submitted applications</Link>
              )}
              <Link to="/opportunities">Explore official opportunities</Link>
              <Link to="/notifications">Open your inbox</Link>
            </section>
            {summary.data && (
              <section className="card feed-summary">
                <h2>Your activity</h2>
                {summary.data.stats
                  .filter((s) => s.label !== "Saved profile version")
                  .map((s, i) => (
                    <div key={i}>
                      <strong>{s.suppressed ? "Below 5" : s.value}</strong>
                      <span>
                        {s.label === "Your applications"
                          ? "Official vacancy applications"
                          : s.label}
                      </span>
                    </div>
                  ))}
              </section>
            )}
            <details className="card feed-checklist">
              <summary>Profile checklist</summary>
              <State resource={completion}>
                <Checklist data={completion.data} />
              </State>
            </details>
          </aside>
        </div>
      )}
    </div>
  );
}

const nextStatuses = {
  submitted: ["reviewing", "forwarded", "declined"],
  reviewing: ["forwarded", "declined"],
};
function ReferralApplicationCard({ application: a, received, reload }) {
  const action = useAction(),
    [next, setNext] = useState(""),
    [reason, setReason] = useState("");
  const choices = nextStatuses[a.status] || [];
  return (
    <article className="card referral-application">
      <div className="split">
        <div>
          <h3>{a.postTitle}</h3>
          <p className="muted">
            {a.company} ·{" "}
            {received ? `From ${a.applicantName}` : "Referral application"}
          </p>
        </div>
        <span className="badge">{a.status}</span>
      </div>
      <small>Submitted {new Date(a.createdAt).toLocaleString()}</small>
      <Flash error={action.error} message={action.message} />
      {received && a.contactEmail && (
        <p>
          Contact: <a href={`mailto:${a.contactEmail}`}>{a.contactEmail}</a>
        </p>
      )}
      {a.message && <p className="preserve">{a.message}</p>}
      {a.cvAvailable && (
        <button
          className="secondary"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              const response = await api.get(`/post-applications/${a._id}/cv`, {
                responseType: "blob",
              });
              const url = URL.createObjectURL(response.data),
                anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = a.cvFilename || "CV.pdf";
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, "CV downloaded.")
          }
        >
          Download submitted CV
        </button>
      )}
      {received && !!choices.length && (
        <form
          className="referral-review"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              await api.patch(
                `/post-applications/${a._id}/status`,
                { status: next || choices[0], reason },
                { headers: { "If-Match": a.revision } },
              );
              setNext("");
              setReason("");
              await reload();
            }, "Application status updated.");
          }}
        >
          <Field label={`Next status for ${a.applicantName}`}>
            <select
              value={next || choices[0]}
              onChange={(e) => setNext(e.target.value)}
            >
              {choices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Review note for ${a.applicantName}`}>
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button disabled={action.busy}>Update application</button>
        </form>
      )}
      {!received &&
        ["submitted", "reviewing", "forwarded"].includes(a.status) && (
          <button
            className="secondary danger-text"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await api.post(`/post-applications/${a._id}/withdraw`, {});
                await reload();
              }, "Application withdrawn. The post author can no longer download your CV.")
            }
          >
            Withdraw referral application
          </button>
        )}
      <details>
        <summary>Application history</summary>
        {a.history.map((h, i) => (
          <p key={i}>
            {h.status} · {new Date(h.at).toLocaleString()}
            {h.reason && ` · ${h.reason}`}
          </p>
        ))}
      </details>
    </article>
  );
}

export function SentReferrals() {
  const resource = useResource("/post-applications?view=sent");
  return (
    <section className="page">
      <h2>Job referral applications</h2>
      <p className="muted">
        PDF CVs you shared privately with authors of dashboard job posts.
      </p>
      <State resource={resource}>
        {resource.data?.items.length ? (
          resource.data.items.map((a) => (
            <ReferralApplicationCard
              key={a._id}
              application={a}
              reload={resource.reload}
            />
          ))
        ) : (
          <Empty>
            No referral applications yet.{" "}
            <Link to="/dashboard">Explore your network feed.</Link>
          </Empty>
        )}
        <Pager resource={resource} url="/post-applications?view=sent" />
      </State>
    </section>
  );
}

export function ReceivedReferrals() {
  const resource = useResource("/post-applications?view=received");
  return (
    <div className="page">
      <Title title="Applications to your posts">
        Review private submissions, download the applicant's CV, and record your
        referral progress.
      </Title>
      <p className="notice">
        Forwarded means you recorded a referral. Nexvia does not automatically
        send the CV to a company.
      </p>
      <button className="secondary" onClick={resource.reload}>
        Refresh applications
      </button>
      <State resource={resource}>
        {resource.data?.items.length ? (
          resource.data.items.map((a) => (
            <ReferralApplicationCard
              key={a._id}
              application={a}
              received
              reload={resource.reload}
            />
          ))
        ) : (
          <Empty>
            No applications yet.{" "}
            <Link to="/dashboard">Share a job referral with your network.</Link>
          </Empty>
        )}
        <Pager resource={resource} url="/post-applications?view=received" />
      </State>
    </div>
  );
}

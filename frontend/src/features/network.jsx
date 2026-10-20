import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { Link } from "react-router-dom";
import FeedDashboard from "./feed";
import {
  useResource,
  useAction,
  Title,
  State,
  Field,
  Flash,
  Empty,
  Pager,
} from "./shared";
export function Community() {
  return <FeedDashboard />;
}
export function Alumni() {
  const resource = useResource("/alumni"),
    degrees = useResource("/academic/degrees");
  return (
    <div className="page">
      <Title title="Alumni network">
        A consent-based directory for learning from graduates and finding
        community guidance.
      </Title>
      <State resource={resource}>
        <div className="grid">
          {resource.data?.items.length ? (
            resource.data.items.map((p) => (
              <article className="card" key={p.userId}>
                <span className="badge">
                  Alumni{p.mentoringOptIn ? " · Guidance interest" : ""}
                </span>
                <h2>{p.fullName}</h2>
                <p>
                  {degrees.data?.find((d) => d._id === p.degreeProgramId)
                    ?.label || "Shared degree"}{" "}
                  · {p.graduationYear}
                </p>
                {p.headline && <p>{p.headline}</p>}
                {p.currentJobTitle && (
                  <p>
                    {p.currentJobTitle}
                    {p.currentOrganization && ` at ${p.currentOrganization}`}
                  </p>
                )}
                {p.bio && <p>{p.bio}</p>}
              </article>
            ))
          ) : (
            <Empty>No alumni have opted into this directory yet.</Empty>
          )}
        </div>
        <Pager resource={resource} url="/alumni" />
      </State>
    </div>
  );
}
export function Notifications() {
  const { user } = useAuth();
  const approved = user.emailVerified && user.approvalStatus === "approved";
  const resource = useResource(approved ? "/notifications" : null),
    preferences = useResource("/notification-preferences"),
    delivery = useResource("/notifications/delivery/me"),
    notices = useResource(
      approved && ["student", "alumni"].includes(user.role)
        ? "/academic-notices"
        : null,
    ),
    action = useAction(),
    [prefs, setPrefs] = useState({});
  useEffect(() => {
    if (preferences.data) setPrefs(preferences.data);
  }, [preferences.data]);
  return (
    <div className="page">
      <Title title="Your inbox">
        Saved academic and career updates. Refresh to see the latest records.
      </Title>
      <Flash error={action.error} message={action.message} />
      {approved ? (
        <>
          <div className="toolbar">
            <button className="secondary" onClick={resource.reload}>
              Refresh inbox
            </button>
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await api.post("/notifications/read-all", {});
                  await resource.reload();
                }, "All current notifications marked read.")
              }
            >
              Mark all read
            </button>
            <span>{resource.data?.unreadCount || 0} unread</span>
          </div>
          <State resource={resource}>
            {resource.data?.items.length ? (
              resource.data.items.map((n) => (
                <article
                  className={`card notification ${n.readAt ? "" : "unread"}`}
                  key={n._id}
                >
                  <h2>{n.title}</h2>
                  <p className="preserve">{n.body}</p>
                  {n.resourceType === "received_post_application" && (
                    <Link to="/post-applications">
                      Review referral applications
                    </Link>
                  )}
                  {n.resourceType === "post_application" && (
                    <Link to="/applications">
                      View your referral applications
                    </Link>
                  )}
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                  {!n.readAt && (
                    <button
                      className="secondary"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          await api.patch(`/notifications/${n._id}/read`, {});
                          await resource.reload();
                        }, "Marked read.")
                      }
                    >
                      Mark read
                    </button>
                  )}
                </article>
              ))
            ) : (
              <Empty>Your inbox is clear.</Empty>
            )}
            <Pager resource={resource} url="/notifications" />
          </State>
        </>
      ) : (
        <p className="notice">
          Complete account approval to access the university inbox. Email
          delivery status and preferences are available below.
        </p>
      )}
      <section className="card">
        <h2>Email preferences</h2>
        <p>
          Verification and recovery messages are transactional. Opportunity and
          CV emails are off until you choose them; application email updates are
          on by default.
        </p>
        <State resource={preferences}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(
                () =>
                  api.patch(
                    "/notification-preferences",
                    Object.fromEntries(
                      ["opportunityEmail", "applicationEmail", "cvEmail"].map(
                        (k) => [k, !!prefs[k]],
                      ),
                    ),
                  ),
                "Email preferences saved.",
              );
            }}
          >
            {[
              ["opportunityEmail", "Opportunity and academic guidance emails"],
              ["applicationEmail", "Application status emails"],
              ["cvEmail", "CV ready emails"],
            ].map(([k, label]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={!!prefs[k]}
                  onChange={(e) =>
                    setPrefs({ ...prefs, [k]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <button disabled={action.busy}>Save preferences</button>
          </form>
        </State>
      </section>
      <section className="card">
        <h2>Email delivery status</h2>
        <button className="secondary" onClick={delivery.reload}>
          Refresh delivery status
        </button>
        <State resource={delivery}>
          {delivery.data?.items.length ? (
            delivery.data.items.map((j) => (
              <p key={j._id}>
                <strong>{j.kind}:</strong> {j.status.replaceAll("_", " ")}
                {j.lastError === "PROVIDER_NOT_CONFIGURED"
                  ? " — Email provider setup is pending."
                  : ""}
              </p>
            ))
          ) : (
            <Empty>No email jobs yet.</Empty>
          )}
        </State>
      </section>
      {notices.data && (
        <section className="card">
          <h2>Current academic notices</h2>
          {notices.data.items.length ? (
            notices.data.items.map((n) => (
              <article className="entry" key={n._id}>
                <h3>{n.title}</h3>
                <p className="preserve">{n.body}</p>
                {n.referenceUrl && (
                  <a
                    href={n.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open academic reference
                  </a>
                )}
              </article>
            ))
          ) : (
            <Empty>No current academic notices for your audience.</Empty>
          )}
        </section>
      )}
    </div>
  );
}

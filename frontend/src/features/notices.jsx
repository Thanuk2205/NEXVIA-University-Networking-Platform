import { useState } from "react";
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
} from "./shared";
import { AcademicFields } from "./profiles";
import { GraduationReview } from "./admin";
export function Notices() {
  const { user } = useAuth(),
    resource = useResource("/academic-notices?view=managed"),
    action = useAction(),
    [edit, setEdit] = useState(null),
    [form, setForm] = useState({
      title: "",
      body: "",
      category: "academic",
      scope: {},
    });
  async function save(e) {
    e.preventDefault();
    await action.run(async () => {
      const body = { ...form };
      if (!body.referenceUrl) delete body.referenceUrl;
      if (!body.expiresAt) delete body.expiresAt;
      else body.expiresAt = new Date(body.expiresAt).toISOString();
      if (edit)
        await api.patch(`/academic-notices/${edit._id}`, body, {
          headers: { "If-Match": edit.revision },
        });
      else await api.post("/academic-notices", body);
      setEdit(null);
      setForm({ title: "", body: "", category: "academic", scope: {} });
      await resource.reload();
    }, "Notice draft saved.");
  }
  return (
    <div className="page">
      <Title title="Academic notices">
        Create standalone university guidance with a controlled audience and
        revision history.
      </Title>
      <Flash error={action.error} message={action.message} />
      <form className="card" onSubmit={save}>
        <h2>{edit ? "Edit notice" : "Create notice draft"}</h2>
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            minLength={5}
            maxLength={200}
          />
        </Field>
        <Field label="Notice body">
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
            maxLength={5000}
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {["academic", "career", "event", "deadline", "general"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <AcademicFields
          value={form.scope}
          onChange={(scope) => setForm({ ...form, scope })}
        />
        <Field label="Reference URL (optional)">
          <input
            type="url"
            value={form.referenceUrl || ""}
            onChange={(e) => setForm({ ...form, referenceUrl: e.target.value })}
          />
        </Field>
        <Field label="Notice expiry (your local time, optional)">
          <input
            type="datetime-local"
            value={form.expiresAt || ""}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </Field>
        <button disabled={action.busy}>Save notice</button>
        {edit && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEdit(null);
              setForm({ title: "", body: "", category: "academic", scope: {} });
            }}
          >
            Cancel edit
          </button>
        )}
      </form>
      <State resource={resource}>
        {resource.data?.items.length ? (
          resource.data.items.map((n) => (
            <article className="card" key={n._id}>
              <div className="split">
                <h2>{n.title}</h2>
                <span className="badge">
                  {n.status} · revision {n.revision}
                </span>
              </div>
              <p className="preserve">{n.body}</p>
              <div className="actions">
                {n.status !== "archived" && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setEdit(n);
                      setForm({
                        title: n.title,
                        body: n.body,
                        category: n.category,
                        scope: n.scope,
                        ...(n.referenceUrl
                          ? { referenceUrl: n.referenceUrl }
                          : {}),
                        ...(n.expiresAt
                          ? {
                              expiresAt: new Date(
                                new Date(n.expiresAt).getTime() -
                                  new Date(n.expiresAt).getTimezoneOffset() *
                                    60000,
                              )
                                .toISOString()
                                .slice(0, 16),
                            }
                          : {}),
                      });
                    }}
                  >
                    Edit
                  </button>
                )}
                {n.status === "draft" && (
                  <button
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        await api.post(
                          `/academic-notices/${n._id}/publish`,
                          {},
                        );
                        await resource.reload();
                      }, "Notice published.")
                    }
                  >
                    Publish
                  </button>
                )}
                {n.status !== "archived" && (
                  <button
                    className="secondary"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        await api.post(
                          `/academic-notices/${n._id}/archive`,
                          {},
                        );
                        await resource.reload();
                      }, "Notice archived. New dispatch is disabled.")
                    }
                  >
                    Archive
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty>No academic notices yet.</Empty>
        )}
        <Pager resource={resource} url="/academic-notices?view=managed" />
      </State>
      {user.role === "faculty" && <GraduationReview faculty />}
    </div>
  );
}
export function Dispatch() {
  const { user } = useAuth(),
    notices = useResource("/academic-notices?view=managed"),
    opportunities = useResource("/opportunities"),
    history = useResource("/dispatches"),
    action = useAction(),
    [type, setType] = useState("academic_notice"),
    [contentId, setContentId] = useState(""),
    [criteria, setCriteria] = useState({}),
    [wide, setWide] = useState(false),
    [preview, setPreview] = useState(null),
    [dispatch, setDispatch] = useState(null);
  const status = useResource(dispatch ? `/dispatches/${dispatch}` : null);
  const options =
    (type === "academic_notice"
      ? notices.data?.items
      : opportunities.data?.items
    )?.filter((i) => i.status === "published") || [];
  function reset() {
    setPreview(null);
  }
  return (
    <div className="page">
      <Title title="Dispatch university guidance">
        Preview the authorized audience before confirming. Delivery history
        stays separate from content ownership.
      </Title>
      <Flash error={action.error} message={action.message} />
      <section className="card">
        <h2>1. Select published content & audience</h2>
        <Field label="Content type">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setContentId("");
              reset();
            }}
          >
            <option value="academic_notice">Academic notice</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </Field>
        <Field label="Published content">
          <select
            value={contentId}
            onChange={(e) => {
              setContentId(e.target.value);
              reset();
            }}
          >
            <option value="">Select content</option>
            {options.map((o) => (
              <option key={o._id} value={o._id}>
                {o.title}
              </option>
            ))}
          </select>
        </Field>
        <AcademicFields
          value={criteria}
          onChange={(v) => {
            setCriteria(v);
            reset();
          }}
        />
        {user.role === "admin" && (
          <label className="check">
            <input
              type="checkbox"
              checked={wide}
              onChange={(e) => {
                setWide(e.target.checked);
                reset();
              }}
            />
            Explicitly allow a university-wide audience when no academic
            restriction is selected.
          </label>
        )}
        <button
          disabled={!contentId || action.busy}
          onClick={() =>
            action.run(async () => {
              const r = await api.post("/dispatches/preview", {
                contentType: type,
                contentId,
                criteria,
                universityWide: wide,
              });
              setPreview(r.data.data);
            }, "Audience preview ready.")
          }
        >
          Preview recipients
        </button>
      </section>
      {preview && (
        <section className="card">
          <h2>2. Review & confirm</h2>
          <p>
            <strong>{preview.count} eligible recipients</strong>
          </p>
          <p>{preview.ruleExplanation}</p>
          <p>
            Content revision {preview.contentRevision} · Preview expires{" "}
            {new Date(preview.expiresAt).toLocaleTimeString()}
          </p>
          <p>
            The confirmed recipient list is fixed. In-app history is saved;
            optional Gmail delivery follows recipient preferences.
          </p>
          <button
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                const r = await api.post("/dispatches", {
                  previewId: preview.previewId,
                });
                setDispatch(r.data.data.dispatchId);
                setPreview(null);
                await history.reload();
              }, "Dispatch queued.")
            }
          >
            Confirm dispatch to {preview.count} recipients
          </button>
        </section>
      )}
      {dispatch && (
        <section className="card">
          <h2>3. Track delivery</h2>
          <button className="secondary" onClick={status.reload}>
            Refresh progress
          </button>
          <State resource={status}>
            <p>
              Status: <strong>{status.data?.status}</strong> · Recipients:{" "}
              {status.data?.total}
            </p>
            {Object.entries(status.data?.recipientProgress || {}).map(
              ([key, n]) => (
                <p key={key}>
                  {key.replaceAll("_", " ")}: {n}
                </p>
              ),
            )}
            <p className="muted">
              Handed off means accepted by the notification queue; it does not
              prove Gmail inbox delivery.
            </p>
            <p>
              Saved inbox records:{" "}
              {status.data?.delivery?.persisted ?? "temporarily unavailable"}
            </p>
            {Object.entries(status.data?.delivery?.email || {}).map(
              ([key, count]) => (
                <p key={key}>
                  Email {key.replaceAll("_", " ")}: {count}
                </p>
              ),
            )}
            {["queued", "processing"].includes(status.data?.status) && (
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api.post(`/dispatches/${dispatch}/cancel`, {});
                    await status.reload();
                  }, "Pending recipients cancelled. Accepted emails cannot be recalled.")
                }
              >
                Cancel pending recipients
              </button>
            )}
          </State>
        </section>
      )}
      <section className="card">
        <h2>Your dispatch history</h2>
        <button className="secondary" onClick={history.reload}>
          Refresh history
        </button>
        <State resource={history}>
          {history.data?.items.length ? (
            history.data.items.map((item) => (
              <article className="entry" key={item._id}>
                <h3>{item.title}</h3>
                <p>
                  {item.status} · {item.total} recipients ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <button
                  className="secondary"
                  onClick={() => setDispatch(item._id)}
                >
                  View delivery progress
                </button>
              </article>
            ))
          ) : (
            <Empty>No dispatches yet.</Empty>
          )}
          <Pager resource={history} url="/dispatches" />
        </State>
      </section>
    </div>
  );
}

import { useState } from "react";
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
import Operations from "./operations";
export function GraduationReview({ faculty = false }) {
  const resource = useResource(
      `/${faculty ? "faculty" : "admin"}/graduation-requests`,
    ),
    action = useAction(),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [year, setYear] = useState(new Date().getFullYear());
  return (
    <section className="card">
      <h2>
        {faculty ? "Scoped graduation recommendations" : "Graduation approvals"}
      </h2>
      <p>
        Final alumni approval belongs to an authorized administrator using
        official institutional records.
      </p>
      <Flash error={action.error} message={action.message} />
      <div className="form-grid">
        <Field label="Institutional evidence reference">
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            minLength={3}
          />
        </Field>
        <Field label="Review reason">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
          />
        </Field>
        {!faculty && (
          <Field label="Verified graduation year">
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </Field>
        )}
      </div>
      <State resource={resource}>
        {resource.data?.items.length ? (
          resource.data.items.map((g) => (
            <article className="entry" key={g._id}>
              <h3>{g.fullName || "Student graduation request"}</h3>
              <p>
                Registration: {g.registrationNumber || g.userId} · Claimed year{" "}
                {g.claimedGraduationYear} ·{" "}
                <span className="badge">{g.status.replaceAll("_", " ")}</span>
              </p>
              {g.reason && <p>{g.reason}</p>}
              {g.recommendations?.map((r, i) => (
                <p key={i}>
                  Faculty recommendation: {r.recommendation} — {r.reason}
                </p>
              ))}
              {["submitted", "under_review"].includes(g.status) && (
                <div className="actions">
                  {(faculty
                    ? ["recommend", "request_review"]
                    : ["approved", "rejected"]
                  ).map((decision) => (
                    <button
                      key={decision}
                      className="secondary"
                      disabled={
                        action.busy || reason.length < 3 || evidence.length < 3
                      }
                      onClick={() =>
                        action.run(async () => {
                          await api[faculty ? "post" : "patch"](
                            `/${faculty ? "faculty" : "admin"}/graduation-requests/${g._id}/${faculty ? "recommendations" : "decision"}`,
                            faculty
                              ? {
                                  recommendation: decision,
                                  reason,
                                  evidenceReference: evidence,
                                }
                              : {
                                  decision,
                                  reason,
                                  evidenceReference: evidence,
                                  ...(decision === "approved"
                                    ? { graduationYear: year }
                                    : {}),
                                },
                          );
                          await resource.reload();
                        }, "Graduation review recorded.")
                      }
                    >
                      {decision.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty>No graduation requests.</Empty>
        )}
        <Pager
          resource={resource}
          url={`/${faculty ? "faculty" : "admin"}/graduation-requests`}
        />
      </State>
    </section>
  );
}
function ReviewQueue({ kind }) {
  const resource = useResource(`/admin/${kind}`),
    action = useAction(),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState("");
  return (
    <section className="card">
      <h2>
        {kind === "organizations"
          ? "Organization review"
          : "Academic membership review"}
      </h2>
      <Flash error={action.error} message={action.message} />
      <Field label="Decision reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Evidence / record reference">
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
      <State resource={resource}>
        {resource.data?.items.length ? (
          resource.data.items.map((row) => (
            <article className="entry" key={row._id}>
              <h3>
                {row.organizationName ||
                  row.fullName ||
                  "Academic review request"}
              </h3>
              <p>
                {kind === "organizations"
                  ? row.website || "No website provided"
                  : `Registration: ${row.fields.registrationNumber}`}
              </p>
              <p>
                Status:{" "}
                <span className="badge">
                  {row.organizationApprovalStatus || row.status}
                </span>
              </p>
              <div className="actions">
                {(kind === "organizations"
                  ? ["approved", "rejected", "suspended"]
                  : row.status === "submitted"
                    ? ["approved", "rejected"]
                    : []
                ).map((decision) => (
                  <button
                    key={decision}
                    className="secondary"
                    disabled={
                      action.busy || reason.length < 3 || evidence.length < 3
                    }
                    onClick={() =>
                      action.run(async () => {
                        await api.patch(
                          `/admin/${kind}/${row._id}/${kind === "organizations" ? "approval" : "decision"}`,
                          kind === "organizations"
                            ? {
                                status: decision,
                                reason,
                                evidenceReference: evidence,
                              }
                            : { decision, reason, evidenceReference: evidence },
                        );
                        await resource.reload();
                      }, "Review decision recorded.")
                    }
                  >
                    {decision}
                  </button>
                ))}
              </div>
            </article>
          ))
        ) : (
          <Empty>No records awaiting review.</Empty>
        )}
        <Pager resource={resource} url={`/admin/${kind}`} />
      </State>
    </section>
  );
}
function AcademicAdmin() {
  const [kind, setKind] = useState("faculties"),
    [label, setLabel] = useState(""),
    [parentId, setParentId] = useState(""),
    [reason, setReason] = useState(""),
    [years, setYears] = useState(4);
  const parentKind = {
      departments: "faculties",
      degrees: "departments",
      batches: "degrees",
    }[kind],
    parents = useResource(parentKind ? `/academic/${parentKind}` : null),
    resource = useResource(`/academic/${kind}`),
    action = useAction();
  return (
    <section className="card">
      <h2>Academic taxonomy</h2>
      <Flash error={action.error} message={action.message} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.run(async () => {
            await api.post(`/admin/academic/${kind}`, {
              label,
              reason,
              ...(parentKind ? { parentId } : {}),
              ...(kind === "degrees" ? { yearCount: years } : {}),
            });
            setLabel("");
            await resource.reload();
          }, "Academic record created.");
        }}
      >
        <div className="form-grid">
          <Field label="Record type">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setParentId("");
              }}
            >
              {["faculties", "departments", "degrees", "batches", "skills"].map(
                (k) => (
                  <option key={k}>{k}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Label">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              minLength={2}
            />
          </Field>
          {parentKind && (
            <Field label="Parent">
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                required
              >
                <option value="">Select parent</option>
                {parents.data?.map((p) => (
                  <option value={p._id} key={p._id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "degrees" && (
            <Field label="Degree duration in years">
              <input
                type="number"
                min="1"
                max="10"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="Change reason">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </Field>
        </div>
        <button disabled={action.busy}>Add record</button>
      </form>
      <State resource={resource}>
        {resource.data?.map((r) => (
          <div className="list-row" key={r._id}>
            <span>{r.label}</span>
            <button
              className="secondary"
              disabled={action.busy || reason.length < 3}
              onClick={() =>
                action.run(async () => {
                  await api.patch(`/admin/academic/${kind}/${r._id}`, {
                    active: false,
                    reason,
                  });
                  await resource.reload();
                }, "Record archived; historical references preserved.")
              }
            >
              Archive
            </button>
          </div>
        ))}
      </State>
    </section>
  );
}
export default function AdminPage() {
  const accounts = useResource("/admin/accounts"),
    reports = useResource("/admin/reports"),
    action = useAction(),
    [reason, setReason] = useState(""),
    [email, setEmail] = useState(""),
    [scope, setScope] = useState({}),
    [invitation, setInvitation] = useState("");
  return (
    <div className="page">
      <Title title="University administration">
        Review identity and academic evidence, control staff authority, and
        record the reason for each decision.
      </Title>
      <Flash error={action.error} message={action.message} />
      <ReviewQueue kind="membership-requests" />
      <ReviewQueue kind="organizations" />
      <section className="card">
        <h2>Account approval & status</h2>
        <p>
          Approve academic membership or the organization first. Email ownership
          must be verified independently.
        </p>
        <Field label="Administrative reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <State resource={accounts}>
          {accounts.data?.items.map((a) => (
            <article className="entry" key={a.userId}>
              <strong>{a.email}</strong>
              <p>
                {a.role} · Email {a.emailVerified ? "verified" : "pending"} ·{" "}
                {a.approvalStatus} · {a.isActive ? "active" : "inactive"}
              </p>
              {a.role !== "admin" && (
                <div className="actions">
                  {["approved", "rejected", "suspended"].map(
                    (approvalStatus) => (
                      <button
                        className="secondary"
                        key={approvalStatus}
                        disabled={action.busy || reason.length < 3}
                        onClick={() =>
                          action.run(async () => {
                            await api.patch(
                              `/admin/accounts/${a.userId}/verification`,
                              { approvalStatus, reason },
                            );
                            await accounts.reload();
                          }, "Account review recorded; previous sessions revoked.")
                        }
                      >
                        {approvalStatus}
                      </button>
                    ),
                  )}
                  <button
                    className="secondary"
                    disabled={action.busy || reason.length < 3}
                    onClick={() =>
                      action.run(async () => {
                        await api.patch(`/admin/accounts/${a.userId}/status`, {
                          isActive: !a.isActive,
                          reason,
                        });
                        await accounts.reload();
                      }, "Account status changed.")
                    }
                  >
                    {a.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              )}
            </article>
          ))}
          <Pager resource={accounts} url="/admin/accounts" />
        </State>
      </section>
      <GraduationReview />
      <AcademicAdmin />
      <section className="card">
        <h2>Invite faculty staff</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              const res = await api.post("/admin/staff-invitations", {
                email,
                approvedAcademicScope: scope,
                reason,
              });
              setInvitation(res.data.data.invitationToken);
            }, "Faculty invitation created. Share the private token with the intended staff member.");
          }}
        >
          <Field label="Staff email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <AcademicFields value={scope} onChange={setScope} />
          <Field label="Invitation reason">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </Field>
          <button disabled={action.busy}>Create faculty invitation</button>
        </form>
        {invitation && (
          <p className="notice break-word">
            Private invitation token: {invitation}. Accept it at
            /accept-invitation.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Community moderation</h2>
        <State resource={reports}>
          {reports.data?.items.length ? (
            reports.data.items.map((r) => (
              <article className="entry" key={r._id}>
                <p>{r.reason}</p>
                <p>Report status: {r.status}</p>
                <div className="actions">
                  {["hide", "restore"].map((value) => (
                    <button
                      className="secondary"
                      key={value}
                      disabled={action.busy || reason.length < 3}
                      onClick={() =>
                        action.run(async () => {
                          await api.post("/admin/moderation-actions", {
                            postId: r.postId,
                            action: value,
                            reason,
                          });
                          await reports.reload();
                        }, "Moderation action recorded.")
                      }
                    >
                      {value} post
                    </button>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <Empty>No moderation reports.</Empty>
          )}
        </State>
      </section>
      <Operations />
    </div>
  );
}

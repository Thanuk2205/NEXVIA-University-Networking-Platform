import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import {
  useResource,
  useAction,
  State,
  Title,
  Field,
  Flash,
  Checklist,
  Empty,
} from "./shared";
const arrayDefinitions = {
  education: [
    ["institution", "Institution"],
    ["qualification", "Qualification"],
    ["startYear", "Start year", "number"],
    ["endYear", "End year", "number", true],
  ],
  projects: [
    ["title", "Project title"],
    ["description", "Description", "textarea"],
  ],
  experience: [
    ["title", "Job title"],
    ["organization", "Organization"],
    ["startDate", "Start date", "date"],
    ["endDate", "End date", "date", true],
    ["description", "Description", "textarea", true],
  ],
  certifications: [
    ["name", "Certification"],
    ["issuer", "Issuer"],
    ["issuedDate", "Issued date", "date"],
  ],
  achievements: [
    ["title", "Achievement"],
    ["kind", "Kind", "kind"],
    ["description", "Description", "textarea", true],
  ],
  professionalLinks: [
    ["label", "Link label"],
    ["url", "URL", "url"],
  ],
};
export function EntryEditor({
  name,
  values = [],
  onChange,
  definitions = arrayDefinitions[name],
}) {
  return (
    <fieldset className="entries">
      <legend>{name.replace(/([A-Z])/g, " $1")}</legend>
      {values.map((entry, index) => (
        <div className="entry" key={index}>
          <div className="form-grid">
            {definitions.map(
              ([key, label, type = "text", optional = false]) => (
                <Field
                  label={`${label}${optional ? " (optional)" : ""}`}
                  key={key}
                >
                  {type === "textarea" ? (
                    <textarea
                      value={entry[key] || ""}
                      onChange={(e) =>
                        onChange(
                          values.map((v, i) =>
                            i === index ? { ...v, [key]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  ) : type === "kind" ? (
                    <select
                      value={entry[key] || "other"}
                      onChange={(e) =>
                        onChange(
                          values.map((v, i) =>
                            i === index ? { ...v, [key]: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      {[
                        "academic_award",
                        "competition",
                        "publication",
                        "other",
                      ].map((k) => (
                        <option key={k} value={k}>
                          {k.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type}
                      value={entry[key] ?? ""}
                      onChange={(e) =>
                        onChange(
                          values.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  [key]:
                                    type === "number"
                                      ? e.target.value
                                        ? Number(e.target.value)
                                        : undefined
                                      : e.target.value,
                                }
                              : v,
                          ),
                        )
                      }
                      required={!optional}
                    />
                  )}
                </Field>
              ),
            )}
          </div>
          <button
            type="button"
            className="secondary danger-text"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove entry
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          onChange([
            ...values,
            name === "achievements" ? { kind: "other" } : {},
          ])
        }
      >
        Add{" "}
        {name === "education"
          ? "education"
          : name === "professionalLinks"
            ? "link"
            : "entry"}
      </button>
    </fieldset>
  );
}
export function AcademicFields({
  value,
  onChange,
  disabled = false,
  includeRegistration = false,
}) {
  const records = useResource("/academic/faculties"),
    departments = useResource("/academic/departments"),
    degrees = useResource("/academic/degrees"),
    batches = useResource("/academic/batches");
  const groups = [
    ["facultyId", "Faculty", records],
    ["departmentId", "Department", departments],
    ["degreeProgramId", "Degree program", degrees],
    ["batchId", "Batch", batches],
  ];
  return (
    <div className="form-grid">
      {includeRegistration && (
        <Field label="Registration number">
          <input
            disabled={disabled}
            value={value.registrationNumber || ""}
            onChange={(e) =>
              onChange({ ...value, registrationNumber: e.target.value })
            }
          />
        </Field>
      )}
      {groups.map(([key, label, r], i) => (
        <Field label={label} key={key}>
          <select
            disabled={disabled}
            value={value[key] || ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next[key] = e.target.value;
              else delete next[key];
              for (let j = i + 1; j < groups.length; j++)
                delete next[groups[j][0]];
              onChange(next);
            }}
          >
            <option value="">Select {label.toLowerCase()}</option>
            {(r.data || [])
              .filter(
                (item) =>
                  i === 0 ||
                  !value[groups[i - 1][0]] ||
                  item.parentId === value[groups[i - 1][0]],
              )
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.label}
                </option>
              ))}
          </select>
        </Field>
      ))}
      <Field label="Academic year">
        <input
          type="number"
          min="1"
          max="10"
          disabled={disabled}
          value={value.academicYear || ""}
          onChange={(e) =>
            onChange({ ...value, academicYear: Number(e.target.value) })
          }
        />
      </Field>
    </div>
  );
}
function Organization() {
  const resource = useResource("/organizations/me"),
    action = useAction(),
    [form, setForm] = useState({
      organizationName: "",
      industry: "",
      website: "",
      organizationDescription: "",
    });
  useEffect(() => {
    if (resource.data) setForm(resource.data);
  }, [resource.data]);
  return (
    <section className="card">
      <h2>Your organization</h2>
      <p>
        One approved recruiter account manages the company's vacancies and
        applications. Current approval:{" "}
        <strong>
          {resource.data?.organizationApprovalStatus || "not submitted"}
        </strong>
        .
      </p>
      <Flash error={action.error} message={action.message} />
      <State resource={resource}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              const b = Object.fromEntries(
                [
                  "organizationName",
                  "industry",
                  "website",
                  "organizationDescription",
                ]
                  .filter((k) => form[k])
                  .map((k) => [k, form[k]]),
              );
              await api[resource.data ? "patch" : "post"](
                resource.data ? "/organizations/me" : "/organizations",
                b,
              );
              await resource.reload();
            }, "Organization details submitted. Material identity changes require review.");
          }}
        >
          {[
            "organizationName",
            "industry",
            "website",
            "organizationDescription",
          ].map((k) => (
            <Field
              label={
                {
                  organizationName: "Organization name",
                  industry: "Industry (optional)",
                  website: "Website (optional)",
                  organizationDescription: "Description (optional)",
                }[k]
              }
              key={k}
            >
              {k === "organizationDescription" ? (
                <textarea
                  value={form[k] || ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              ) : (
                <input
                  type={k === "website" ? "url" : "text"}
                  value={form[k] || ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  required={k === "organizationName"}
                />
              )}
            </Field>
          ))}
          <button disabled={action.busy}>
            {resource.data
              ? "Save organization"
              : "Submit organization for review"}
          </button>
        </form>
      </State>
    </section>
  );
}
export default function ProfilePage() {
  const { user } = useAuth(),
    resource = useResource("/profiles/me"),
    ready = useResource("/profiles/me/completion"),
    skills = useResource("/academic/skills"),
    graduation = useResource(
      ["student", "alumni"].includes(user.role)
        ? "/profiles/me/graduation-requests"
        : null,
    ),
    action = useAction();
  const [form, setForm] = useState({}),
    [claimedYear, setClaimedYear] = useState(new Date().getFullYear()),
    [showDeletion, setShowDeletion] = useState(false),
    [password, setPassword] = useState("");
  useEffect(() => {
    if (resource.data) setForm(resource.data);
  }, [resource.data]);
  const learner = ["student", "alumni"].includes(user.role);
  const baseVisible = [
    "fullName",
    "headline",
    "bio",
    "location",
    "professionalLinks",
  ];
  const visible = learner
    ? [
        ...baseVisible,
        "facultyId",
        "departmentId",
        "degreeProgramId",
        "batchId",
        ...(user.role === "student"
          ? ["academicYear"]
          : [
              "graduationYear",
              "currentJobTitle",
              "currentOrganization",
              "employmentStatus",
            ]),
        "careerInterests",
        "skills",
        "education",
        "projects",
        "experience",
        "certifications",
        "achievements",
      ]
    : [
        ...baseVisible,
        ...(user.role === "employer"
          ? ["organizationDescription", "recruiterJobTitle"]
          : ["designation", "officeContactUrl"]),
      ];
  const selectedKey = learner ? "visibleCareerFields" : "visibleProfileFields";
  async function save(e) {
    e.preventDefault();
    await action.run(async () => {
      const keys = [
        "fullName",
        "headline",
        "bio",
        "location",
        "professionalLinks",
        "profileVisibility",
        selectedKey,
        ...(learner
          ? [
              "careerInterests",
              "skills",
              "education",
              "projects",
              "experience",
              "certifications",
              "achievements",
              "candidateDiscovery",
            ]
          : user.role === "employer"
            ? ["recruiterJobTitle", "organizationDescription"]
            : ["staffReference", "designation", "officeContactUrl"]),
        ...(user.role === "alumni"
          ? [
              "currentJobTitle",
              "currentOrganization",
              "employmentStatus",
              "alumniDirectory",
              "mentoringOptIn",
            ]
          : []),
      ];
      if (learner && !resource.data.membershipApproved)
        keys.push(
          "registrationNumber",
          "facultyId",
          "departmentId",
          "degreeProgramId",
          "batchId",
          "academicYear",
        );
      const body = Object.fromEntries(
        keys
          .filter((k) => form[k] !== undefined && form[k] !== "")
          .map((k) => [k, form[k]]),
      );
      await api.patch("/profiles/me", body, {
        headers: { "If-Match": resource.data.profileVersion },
      });
      await Promise.all([resource.reload(), ready.reload()]);
    });
  }
  async function membership() {
    const keys = [
      "registrationNumber",
      "facultyId",
      "departmentId",
      "degreeProgramId",
      "batchId",
      "academicYear",
    ];
    const fields = Object.fromEntries(keys.map((k) => [k, form[k]]));
    if (user.role === "alumni") fields.graduationYear = Number(claimedYear);
    await action.run(
      () => api.post("/profiles/me/membership-requests", fields),
      "Academic details submitted for institutional review.",
    );
  }
  return (
    <div className="page">
      <Title title="Your profile">
        A factual career profile. Visibility that stays in your control.
      </Title>
      <Flash error={action.error} message={action.message} />
      <section className="card">
        <h2>Account verification</h2>
        <p>
          Email ownership:{" "}
          <strong>{user.emailVerified ? "verified" : "pending"}</strong> ·
          Institutional approval: <strong>{user.approvalStatus}</strong>
        </p>
        {!user.emailVerified && (
          <button
            disabled={action.busy}
            onClick={() =>
              action.run(
                () => api.post("/auth/resend-verification", {}),
                "Verification email queued. Check delivery status in your inbox settings.",
              )
            }
          >
            Resend verification email
          </button>
        )}
      </section>
      <State resource={resource}>
        <form className="card" onSubmit={save}>
          <h2>Personal & career details</h2>
          <div className="form-grid">
            <Field label="Full name">
              <input
                value={form.fullName || ""}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Headline (optional)">
              <input
                value={form.headline || ""}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="City (optional)">
              <input
                value={form.location?.city || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    location: { ...form.location, city: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Country code (optional)">
              <input
                value={form.location?.countryCode || ""}
                maxLength={2}
                onChange={(e) => {
                  const location = { ...form.location };
                  if (e.target.value)
                    location.countryCode = e.target.value.toUpperCase();
                  else delete location.countryCode;
                  setForm({ ...form, location });
                }}
                placeholder="LK"
              />
            </Field>
          </div>
          <Field label="Bio (optional)">
            <textarea
              value={form.bio || ""}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={1000}
            />
          </Field>
          <EntryEditor
            name="professionalLinks"
            values={form.professionalLinks}
            onChange={(v) => setForm({ ...form, professionalLinks: v })}
          />
          {learner && (
            <>
              <h3>Academic details</h3>
              <AcademicFields
                value={form}
                onChange={setForm}
                includeRegistration
              />
              {resource.data?.membershipApproved && (
                <p className="muted">
                  Changes to verified academic details need a new review. Saving
                  your career profile does not change approved membership.
                </p>
              )}
              <button
                type="button"
                className="secondary"
                disabled={action.busy}
                onClick={membership}
              >
                Submit academic details for review
              </button>
              {user.role === "alumni" && (
                <Field label="Graduation year for review">
                  <input
                    type="number"
                    value={claimedYear}
                    onChange={(e) => setClaimedYear(Number(e.target.value))}
                  />
                </Field>
              )}
              <h3>Career interests & skills</h3>
              <Field label="Career interests (up to five, comma-separated)">
                <input
                  value={(form.careerInterests || []).join(", ")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      careerInterests: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <div className="choices">
                {(skills.data || []).map((skill) => (
                  <label key={skill._id}>
                    <input
                      type="checkbox"
                      checked={(form.skills || []).includes(skill._id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          skills: e.target.checked
                            ? [...(form.skills || []), skill._id]
                            : (form.skills || []).filter(
                                (s) => s !== skill._id,
                              ),
                        })
                      }
                    />
                    {skill.label}
                  </label>
                ))}
              </div>
              {[
                "education",
                "projects",
                "experience",
                "certifications",
                "achievements",
              ].map((name) => (
                <EntryEditor
                  key={name}
                  name={name}
                  values={form[name]}
                  onChange={(v) => setForm({ ...form, [name]: v })}
                />
              ))}
            </>
          )}
          {user.role === "alumni" && (
            <div className="form-grid">
              {["currentJobTitle", "currentOrganization"].map((k) => (
                <Field
                  label={
                    k === "currentJobTitle"
                      ? "Current job title (optional)"
                      : "Current organization (optional)"
                  }
                  key={k}
                >
                  <input
                    value={form[k] || ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Employment status (optional)">
                <select
                  value={form.employmentStatus || ""}
                  onChange={(e) =>
                    setForm({ ...form, employmentStatus: e.target.value })
                  }
                >
                  <option value="">Not specified</option>
                  {["employed", "seeking_work", "further_study", "other"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </Field>
            </div>
          )}
          {["faculty", "admin"].includes(user.role) && (
            <div className="form-grid">
              {["staffReference", "designation", "officeContactUrl"].map(
                (k) => (
                  <Field
                    key={k}
                    label={
                      {
                        staffReference: "Staff reference",
                        designation: "Designation",
                        officeContactUrl: "Official contact URL (optional)",
                      }[k]
                    }
                  >
                    <input
                      type={k === "officeContactUrl" ? "url" : "text"}
                      value={form[k] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </Field>
                ),
              )}
            </div>
          )}
          {user.role === "employer" && (
            <Field label="Recruiter job title (optional)">
              <input
                value={form.recruiterJobTitle || ""}
                onChange={(e) =>
                  setForm({ ...form, recruiterJobTitle: e.target.value })
                }
              />
            </Field>
          )}
          <h3>Privacy & discovery</h3>
          <Field label="University network profile">
            <select
              value={form.profileVisibility || "owner"}
              onChange={(e) =>
                setForm({ ...form, profileVisibility: e.target.value })
              }
            >
              <option value="owner">Owner only</option>
              <option value="university">
                Selected fields in the verified university network
              </option>
            </select>
          </Field>
          <p className="muted">
            Choose the fields to share. Employer discovery requires name, degree
            and skills; the alumni directory requires name, degree and
            graduation year.
          </p>
          <div className="choices">
            {visible.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={(form[selectedKey] || []).includes(k)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [selectedKey]: e.target.checked
                        ? [...(form[selectedKey] || []), k]
                        : (form[selectedKey] || []).filter((v) => v !== k),
                    })
                  }
                />
                {k.replace(/([A-Z])/g, " $1").replace(/Id$/, "")}
              </label>
            ))}
          </div>
          {learner && (
            <label className="check">
              <input
                type="checkbox"
                checked={!!form.candidateDiscovery?.enabled}
                onChange={(e) =>
                  setForm({
                    ...form,
                    candidateDiscovery: { enabled: e.target.checked },
                  })
                }
              />
              Allow approved employers to discover my selected career fields. My
              private CV and contact details stay private.
            </label>
          )}
          {user.role === "alumni" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!form.alumniDirectory?.enabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      alumniDirectory: { enabled: e.target.checked },
                    })
                  }
                />
                Join the alumni directory with my selected fields.
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!form.mentoringOptIn}
                  onChange={(e) =>
                    setForm({ ...form, mentoringOptIn: e.target.checked })
                  }
                />
                I am interested in offering community guidance.
              </label>
            </>
          )}
          <button disabled={action.busy}>Save profile</button>
        </form>
      </State>
      <Checklist data={ready.data} />
      {user.role === "employer" && <Organization />}
      {learner && (
        <section className="card">
          <h2>Graduation & alumni status</h2>
          <p>
            Your existing account retains its profile, posts, CVs and
            application history after university-approved graduation.
          </p>
          {user.role === "student" && (
            <>
              <Field label="Graduation year">
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  value={claimedYear}
                  onChange={(e) => setClaimedYear(Number(e.target.value))}
                />
              </Field>
              <button
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api.post("/profiles/me/graduation-requests", {
                      degreeProgramId: resource.data.degreeProgramId,
                      batchId: resource.data.batchId,
                      claimedGraduationYear: Number(claimedYear),
                    });
                    await graduation.reload();
                  }, "Graduation request submitted for institutional review.")
                }
              >
                Request alumni transition
              </button>
            </>
          )}
          {graduation.data?.map((g) => (
            <p key={g._id}>
              {g.claimedGraduationYear}:{" "}
              <span className="badge">{g.status.replaceAll("_", " ")}</span>
              {g.reason && ` — ${g.reason}`}
            </p>
          ))}
        </section>
      )}
      <section className="card">
        <h2>Account lifecycle</h2>
        <button
          className="secondary danger-text"
          onClick={() => setShowDeletion(!showDeletion)}
        >
          Request account deactivation and retention review
        </button>
        {showDeletion && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action
                .run(
                  () => api.delete("/accounts/me", { data: { password } }),
                  "Account deactivated. Application/audit retention review is pending.",
                )
                .then((r) => {
                  if (r) window.location.assign("/login");
                });
            }}
          >
            <p>
              Access is revoked immediately. Submitted applications and
              institutional audit history follow the university's retention
              policy.
            </p>
            <Field label="Confirm your password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <button className="danger" disabled={action.busy}>
              Deactivate my account
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

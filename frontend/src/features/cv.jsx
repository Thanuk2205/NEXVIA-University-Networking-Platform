import { useState } from "react";
import api, { fetchData } from "../api/axios";
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
import { EntryEditor } from "./profiles";
export default function CvPage() {
  const resource = useResource("/cv/documents"),
    action = useAction(),
    [ai, setAi] = useState(false),
    [contact, setContact] = useState(false),
    [job, setJob] = useState(null),
    [selected, setSelected] = useState(null),
    [content, setContent] = useState(null),
    [approved, setApproved] = useState(false);
  const revisions = useResource(
    selected ? `/cv/documents/${selected._id}/revisions` : null,
  );
  async function track() {
    await action.run(async () => {
      const status = await fetchData(`/cv/generations/${job.jobId || job._id}`);
      setJob(status);
      if (status.status === "completed") {
        await resource.reload();
        const doc = await fetchData(`/cv/documents/${status.documentId}`);
        setSelected(doc);
        setContent(doc.content);
        setApproved(doc.reviewed);
      }
    }, "Generation status refreshed.");
  }
  async function download() {
    await action.run(async () => {
      const response = await api.get(`/cv/documents/${selected._id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Nexvia-CV.pdf";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "PDF downloaded.");
  }
  return (
    <div className="page">
      <Title title="CV studio">
        Start with your saved facts, edit your draft, and review every claim
        before export.
      </Title>
      <Flash error={action.error} message={action.message} />
      <section className="card">
        <h2>Generate a factual draft</h2>
        <p>
          Education and a completed approved profile are required. Projects,
          work history, certifications and awards are optional.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={ai}
            onChange={(e) => setAi(e.target.checked)}
          />
          I consent to sending minimal career facts to Gemini to assist summary
          selection. Contact details and registration numbers are excluded.
          Declining keeps factual template mode available.
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={contact}
            onChange={(e) => setContact(e.target.checked)}
          />
          Include my verified email in my private CV. It becomes visible to a
          recruiter only if I submit this CV.
        </label>
        <button
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              const r = await api.post("/cv/generations", {
                aiConsent: ai,
                includeContactEmail: contact,
              });
              setJob(r.data.data);
            }, "CV generation queued.")
          }
        >
          Generate draft
        </button>
        {job && (
          <div className="notice">
            <p>
              Generation: {job.status}
              {job.mode && ` · ${job.mode}`}
            </p>
            {job.lastError && <p>{job.lastError}</p>}
            <button
              className="secondary"
              onClick={track}
              disabled={action.busy}
            >
              Refresh generation status
            </button>
          </div>
        )}
      </section>
      <State resource={resource}>
        <section className="card">
          <h2>Your saved CVs</h2>
          {resource.data?.items.length ? (
            resource.data.items.map((d) => (
              <button
                className="secondary"
                key={d._id}
                onClick={() => {
                  setSelected(d);
                  setContent(d.content);
                  setApproved(d.reviewed);
                }}
              >
                {d.content.fullName} · revision {d.revision} ·{" "}
                {d.reviewed ? "reviewed" : "draft"}
              </button>
            ))
          ) : (
            <Empty>No saved CVs yet.</Empty>
          )}
        </section>
      </State>
      {selected && (
        <section className="card">
          <h2>Saved revision history</h2>
          <State resource={revisions}>
            {revisions.data?.items?.map((revision) => (
              <details key={revision._id}>
                <summary>
                  Revision {revision.revision} ·{" "}
                  {new Date(revision.createdAt).toLocaleString()}
                </summary>
                <p>{revision.content?.summary}</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setContent(revision.content);
                    setApproved(false);
                  }}
                >
                  Use as an editable draft
                </button>
              </details>
            ))}
            <Pager
              resource={revisions}
              url={`/cv/documents/${selected._id}/revisions`}
            />
          </State>
        </section>
      )}
      {selected && content && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              const r = await api.patch(
                `/cv/documents/${selected._id}`,
                { content, reviewed: true },
                { headers: { "If-Match": selected.revision } },
              );
              setSelected(r.data.data);
              setApproved(true);
              await resource.reload();
              await revisions.reload();
            }, "Reviewed CV revision saved.");
          }}
        >
          <h2>Edit & review</h2>
          <Field label="Full name">
            <input
              value={content.fullName}
              onChange={(e) => {
                setContent({ ...content, fullName: e.target.value });
                setApproved(false);
              }}
              required
            />
          </Field>
          <Field label="Headline">
            <input
              value={content.headline || ""}
              onChange={(e) => {
                setContent({ ...content, headline: e.target.value });
                setApproved(false);
              }}
            />
          </Field>
          <Field label="Summary">
            <textarea
              value={content.summary}
              onChange={(e) => {
                setContent({ ...content, summary: e.target.value });
                setApproved(false);
              }}
              maxLength={2000}
            />
          </Field>
          <Field label="Skills (comma-separated)">
            <input
              value={content.skills.join(", ")}
              onChange={(e) => {
                setContent({
                  ...content,
                  skills: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                });
                setApproved(false);
              }}
            />
          </Field>
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
              values={content[name]}
              definitions={
                {
                  education: [
                    ["institution", "Institution"],
                    ["qualification", "Qualification"],
                    ["startYear", "Start year", "number"],
                    ["endYear", "End year", "number", true],
                  ],
                  projects: [
                    ["title", "Project"],
                    ["description", "Description", "textarea"],
                  ],
                  experience: [
                    ["title", "Title"],
                    ["organization", "Organization"],
                    ["startDate", "Start date", "date"],
                    ["endDate", "End date", "date", true],
                    ["description", "Description", "textarea", true],
                  ],
                  certifications: [
                    ["name", "Certification"],
                    ["issuer", "Issuer"],
                  ],
                  achievements: [
                    ["title", "Achievement"],
                    ["description", "Description", "textarea", true],
                  ],
                }[name]
              }
              onChange={(v) => {
                setContent({ ...content, [name]: v });
                setApproved(false);
              }}
            />
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              required
            />
            I reviewed this CV and confirm that its claims are factual.
          </label>
          <div className="actions">
            <button disabled={action.busy || !approved}>
              Save reviewed revision
            </button>
            <button
              type="button"
              className="secondary"
              disabled={
                action.busy ||
                !selected.reviewed ||
                JSON.stringify(content) !== JSON.stringify(selected.content)
              }
              onClick={download}
            >
              Download saved PDF
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

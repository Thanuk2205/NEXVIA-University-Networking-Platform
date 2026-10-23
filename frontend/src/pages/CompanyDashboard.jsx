import { useEffect, useState } from "react";
import api from "../api/axios";

export default function CompanyDashboard() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "internship",
    requiredSkills: "",
    targetDegreePrograms: "",
    location: "",
    isRemote: false,
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/jobs", { params: { status: "open" } });
    setJobs(res.data.jobs);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setStatus("");
    try {
      const payload = {
        ...form,
        requiredSkills: form.requiredSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        targetDegreePrograms: form.targetDegreePrograms
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await api.post("/jobs", payload);
      setStatus(
        `Posted. ${res.data.suggestedCandidates} candidate(s) auto-suggested by the matching engine.`,
      );
      setForm({
        title: "",
        description: "",
        type: "internship",
        requiredSkills: "",
        targetDegreePrograms: "",
        location: "",
        isRemote: false,
      });
      load();
    } catch (err) {
      setStatus(err.response?.data?.message || "Failed to post job");
    }
  }

  async function viewCandidates(job) {
    setSelectedJob(job);
    const res = await api.get(`/jobs/${job._id}/candidates`);
    setCandidates(res.data.applications);
  }

  async function updateStatus(appId, newStatus) {
    await api.patch(`/jobs/applications/${appId}/status`, {
      status: newStatus,
    });
    if (selectedJob) viewCandidates(selectedJob);
  }

  return (
    <div className="page">
      <h2>Company Dashboard</h2>
      <div className="dashboard-grid">
        <form className="card" onSubmit={handleCreate}>
          <h3>Post a Job / Internship</h3>
          {status && <div className="notice">{status}</div>}
          <label>Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <label>Description</label>
          <textarea
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label>Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="internship">Internship</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
          </select>
          <label>Required Skills (comma-separated)</label>
          <input
            value={form.requiredSkills}
            onChange={(e) =>
              setForm({ ...form, requiredSkills: e.target.value })
            }
            placeholder="React, Node.js"
          />
          <label>Target Degree Programs (comma-separated)</label>
          <input
            value={form.targetDegreePrograms}
            onChange={(e) =>
              setForm({ ...form, targetDegreePrograms: e.target.value })
            }
            placeholder="IT"
          />
          <label>Location</label>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.isRemote}
              onChange={(e) => setForm({ ...form, isRemote: e.target.checked })}
            />{" "}
            Remote
          </label>
          <button type="submit">Post Job</button>
        </form>

        <div className="card">
          <h3>My Postings</h3>
          {jobs.map((job) => (
            <div
              key={job._id}
              className="list-row clickable"
              onClick={() => viewCandidates(job)}
            >
              <span>{job.title}</span>
              <span className="tag">{job.type}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedJob && (
        <div className="card">
          <h3>AI-Suggested Candidates — {selectedJob.title}</h3>
          {candidates.length === 0 && (
            <p className="muted">No candidates matched yet.</p>
          )}
          {candidates.map((c) => (
            <div key={c._id} className="list-row">
              <div>
                <strong>{c.applicant?.name}</strong>
                <p className="muted">
                  {c.applicant?.academicProfile?.degreeProgram} · Match score:{" "}
                  {c.matchScore}%
                </p>
              </div>
              <div className="row-actions">
                <span className={`status status-${c.status}`}>{c.status}</span>
                <select
                  value={c.status}
                  onChange={(e) => updateStatus(c._id, e.target.value)}
                >
                  <option value="applied">Applied</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="rejected">Rejected</option>
                  <option value="hired">Hired</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

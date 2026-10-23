import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import JobCard from "../components/JobCard";

export default function JobListings() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [filters, setFilters] = useState({
    degreeProgram: "",
    skill: "",
    type: "",
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function load() {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v),
    );
    const res = await api.get("/jobs", { params });
    setJobs(res.data.jobs);
  }

  async function apply(jobId) {
    try {
      await api.post(`/jobs/${jobId}/apply`);
      setStatus("Application submitted!");
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not apply");
    }
  }

  return (
    <div className="page">
      <h2>Opportunities</h2>
      <div className="filters">
        <input
          placeholder="Degree program (e.g. IT)"
          value={filters.degreeProgram}
          onChange={(e) =>
            setFilters({ ...filters, degreeProgram: e.target.value })
          }
        />
        <input
          placeholder="Skill (e.g. React)"
          value={filters.skill}
          onChange={(e) => setFilters({ ...filters, skill: e.target.value })}
        />
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">All types</option>
          <option value="internship">Internship</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
        </select>
      </div>
      {status && <div className="notice">{status}</div>}
      <div className="grid">
        {jobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            actions={
              user && ["student", "alumni"].includes(user.role) ? (
                <button onClick={() => apply(job._id)}>Apply</button>
              ) : null
            }
          />
        ))}
        {jobs.length === 0 && (
          <p className="muted">No opportunities match those filters yet.</p>
        )}
      </div>
    </div>
  );
}

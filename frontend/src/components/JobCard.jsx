export default function JobCard({ job, actions }) {
  return (
    <div className="card job-card">
      <div className="job-card-header">
        <h3>{job.title}</h3>
        <span className={`badge badge-${job.type}`}>{job.type}</span>
      </div>
      <p className="muted">
        {job.company?.companyProfile?.companyName || job.company?.name}
        {job.location ? ` · ${job.location}` : ""}
        {job.isRemote ? " · Remote" : ""}
      </p>
      <p>{job.description}</p>
      {job.requiredSkills?.length > 0 && (
        <div className="tag-list">
          {job.requiredSkills.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
      )}
      {actions}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function StudentDashboard() {
  const [applications, setApplications] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api
      .get("/jobs/my-applications")
      .then((res) => setApplications(res.data.applications));
    api
      .get("/notifications")
      .then((res) => setNotifications(res.data.notifications));
  }, []);

  return (
    <div className="page">
      <h2>Student Dashboard</h2>
      <div className="dashboard-grid">
        <div className="card">
          <h3>My Applications</h3>
          {applications.length === 0 && (
            <p className="muted">
              No applications yet. <Link to="/jobs">Browse opportunities</Link>.
            </p>
          )}
          {applications.map((a) => (
            <div key={a._id} className="list-row">
              <span>{a.job?.title}</span>
              <span className={`status status-${a.status}`}>{a.status}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Notices for You</h3>
          {notifications.length === 0 && (
            <p className="muted">No notices yet.</p>
          )}
          {notifications.map((n) => (
            <div key={n._id} className="list-row">
              <div>
                <strong>{n.title}</strong>
                <p className="muted">{n.message}</p>
              </div>
              <span className="tag">{n.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

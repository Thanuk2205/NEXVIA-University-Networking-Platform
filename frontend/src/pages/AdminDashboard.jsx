import { useEffect, useState } from "react";
import api from "../api/axios";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [statsRes, usersRes] = await Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/users", { params: { verificationStatus: "pending" } }),
    ]);
    setStats(statsRes.data);
    setPendingUsers(usersRes.data.users);
  }

  async function decide(userId, decision) {
    await api.patch(`/admin/users/${userId}/verify`, { decision });
    load();
  }

  return (
    <div className="page">
      <h2>Admin Panel</h2>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span>{stats.totalUsers}</span>
            <label>Total Users</label>
          </div>
          <div className="stat-card">
            <span>{stats.openJobs}</span>
            <label>Open Jobs</label>
          </div>
          <div className="stat-card">
            <span>{stats.totalPosts}</span>
            <label>Community Posts</label>
          </div>
          <div className="stat-card">
            <span>{stats.pendingVerifications}</span>
            <label>Pending Verifications</label>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Verification Queue</h3>
        {pendingUsers.length === 0 && <p className="muted">Nothing pending.</p>}
        {pendingUsers.map((u) => (
          <div key={u._id} className="list-row">
            <div>
              <strong>{u.name}</strong> <span className="tag">{u.role}</span>
              <p className="muted">
                {u.email}
                {u.companyProfile?.companyName
                  ? ` · ${u.companyProfile.companyName}`
                  : ""}
                {u.academicProfile?.degreeProgram
                  ? ` · ${u.academicProfile.degreeProgram}`
                  : ""}
              </p>
            </div>
            <div className="row-actions">
              <button onClick={() => decide(u._id, "approved")}>Approve</button>
              <button
                className="danger"
                onClick={() => decide(u._id, "rejected")}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

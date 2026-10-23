import { useEffect, useState } from "react";
import api from "../api/axios";

export default function FacultyDashboard() {
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState({
    title: "",
    message: "",
    category: "general",
    faculty: "",
    department: "",
    degreeProgram: "",
    batch: "",
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/notifications");
    setNotifications(res.data.notifications);
  }

  async function handleSend(e) {
    e.preventDefault();
    setStatus("");
    try {
      const { title, message, category, ...target } = form;
      await api.post("/notifications", { title, message, category, target });
      setStatus("Notice dispatched.");
      setForm({
        title: "",
        message: "",
        category: "general",
        faculty: "",
        department: "",
        degreeProgram: "",
        batch: "",
      });
      load();
    } catch (err) {
      setStatus(err.response?.data?.message || "Failed to send notice");
    }
  }

  return (
    <div className="page">
      <h2>Faculty Dashboard</h2>
      <div className="dashboard-grid">
        <form className="card" onSubmit={handleSend}>
          <h3>Dispatch a Targeted Notice</h3>
          <p className="muted">
            Leave a field blank to broadcast to everyone in that dimension.
          </p>
          {status && <div className="notice">{status}</div>}
          <label>Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <label>Message</label>
          <textarea
            required
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
          <label>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="internship">Internship</option>
            <option value="academic">Academic</option>
            <option value="event">Event</option>
            <option value="deadline">Deadline</option>
          </select>
          <label>Faculty (optional)</label>
          <input
            value={form.faculty}
            onChange={(e) => setForm({ ...form, faculty: e.target.value })}
            placeholder="Faculty of Applied Science"
          />
          <label>Department (optional)</label>
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            placeholder="Physical Science"
          />
          <label>Degree Program (optional)</label>
          <input
            value={form.degreeProgram}
            onChange={(e) =>
              setForm({ ...form, degreeProgram: e.target.value })
            }
            placeholder="IT"
          />
          <label>Batch (optional)</label>
          <input
            value={form.batch}
            onChange={(e) => setForm({ ...form, batch: e.target.value })}
            placeholder="2022"
          />
          <button type="submit">Send Notice</button>
        </form>

        <div className="card">
          <h3>Recently Sent</h3>
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

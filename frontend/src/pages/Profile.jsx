import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [skillsInput, setSkillsInput] = useState(
    (user?.studentProfile?.skills || []).join(", "),
  );
  const [bio, setBio] = useState(user?.studentProfile?.bio || "");
  const [status, setStatus] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    const skills = skillsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await api.put("/users/profile", {
      studentProfile: { skills, bio },
    });
    setUser(res.data.user);
    setStatus("Profile updated");
  }

  async function downloadResume() {
    const res = await api.get("/resume/generate", { responseType: "blob" });
    const url = window.URL.createObjectURL(
      new Blob([res.data], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${user.name.replace(/\s+/g, "_")}_Resume.pdf`;
    a.click();
  }

  if (!user) return null;

  return (
    <div className="page">
      <h2>My Profile</h2>
      <div className="card">
        <p>
          <strong>Name:</strong> {user.name}
        </p>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Role:</strong> {user.role}
        </p>
        {user.academicProfile && (
          <p>
            <strong>Academic:</strong>{" "}
            {[
              user.academicProfile.degreeProgram,
              user.academicProfile.department,
              user.academicProfile.faculty,
              user.academicProfile.batch,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p>
          <strong>Verification:</strong> {user.verificationStatus}
        </p>
      </div>

      {["student", "alumni"].includes(user.role) && (
        <>
          <form className="card" onSubmit={handleSave}>
            <h3>Skills & Bio</h3>
            {status && <div className="notice">{status}</div>}
            <label>Skills (comma-separated)</label>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="React, Node.js, MongoDB"
            />
            <label>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
            <button type="submit">Save</button>
          </form>

          <div className="card">
            <h3>AI Resume Builder</h3>
            <p className="muted">
              Generate an ATS-friendly PDF resume from your profile in one
              click.
            </p>
            <button onClick={downloadResume}>Download My Resume (PDF)</button>
          </div>
        </>
      )}
    </div>
  );
}

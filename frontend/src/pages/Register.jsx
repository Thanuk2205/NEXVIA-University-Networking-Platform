import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLES = [
  { value: "student", label: "Student" },
  { value: "alumni", label: "Alumni" },
  { value: "company", label: "Company / Industry Partner" },
  { value: "faculty", label: "Faculty / Administrator" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [academic, setAcademic] = useState({
    faculty: "",
    department: "",
    degreeProgram: "",
    batch: "",
  });
  const [company, setCompany] = useState({
    companyName: "",
    industry: "",
    website: "",
  });
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        role,
        academicProfile: role !== "company" ? academic : undefined,
        companyProfile: role === "company" ? company : undefined,
      };
      const user = await register(payload);
      const dest =
        {
          student: "/dashboard/student",
          alumni: "/dashboard/student",
          company: "/dashboard/company",
          faculty: "/dashboard/faculty",
        }[user.role] || "/";
      navigate(dest);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2>Create your NEXVIA account</h2>
        {error && <div className="error">{error}</div>}

        <label>I am a...</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <label>Full Name</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <label>Email</label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <label>Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {role !== "company" ? (
          <>
            <label>Faculty</label>
            <input
              value={academic.faculty}
              onChange={(e) =>
                setAcademic({ ...academic, faculty: e.target.value })
              }
              placeholder="Faculty of Applied Science"
            />
            <label>Department</label>
            <input
              value={academic.department}
              onChange={(e) =>
                setAcademic({ ...academic, department: e.target.value })
              }
              placeholder="Physical Science"
            />
            <label>Degree Program</label>
            <input
              value={academic.degreeProgram}
              onChange={(e) =>
                setAcademic({ ...academic, degreeProgram: e.target.value })
              }
              placeholder="IT"
            />
            <label>Batch</label>
            <input
              value={academic.batch}
              onChange={(e) =>
                setAcademic({ ...academic, batch: e.target.value })
              }
              placeholder="2022"
            />
          </>
        ) : (
          <>
            <label>Company Name</label>
            <input
              value={company.companyName}
              onChange={(e) =>
                setCompany({ ...company, companyName: e.target.value })
              }
            />
            <label>Industry</label>
            <input
              value={company.industry}
              onChange={(e) =>
                setCompany({ ...company, industry: e.target.value })
              }
            />
            <label>Website</label>
            <input
              value={company.website}
              onChange={(e) =>
                setCompany({ ...company, website: e.target.value })
              }
            />
          </>
        )}

        <button type="submit">Register</button>
        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}

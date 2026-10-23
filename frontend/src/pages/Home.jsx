import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home">
      <section className="hero">
        <h1>NEXVIA</h1>
        <p className="tagline">The Next Way to a Smarter Pathway</p>
        <p className="hero-sub">
          One platform for university notices, internship discovery, AI resume
          building, and industry connections — centralized, role-based, and
          targeted by Faculty, Department, Degree Program and Batch.
        </p>
        {!user && (
          <div className="hero-cta">
            <Link to="/register" className="cta">
              Get Started
            </Link>
            <Link to="/jobs" className="secondary">
              Browse Opportunities
            </Link>
          </div>
        )}
      </section>

      <section className="feature-grid">
        <div className="card">
          <h3>Targeted Notices</h3>
          <p>
            Faculty and admins dispatch academic and internship alerts to the
            exact cohort that needs them.
          </p>
        </div>
        <div className="card">
          <h3>AI Candidate Matching</h3>
          <p>
            Companies post a role and instantly see ranked, pre-qualified
            student matches.
          </p>
        </div>
        <div className="card">
          <h3>AI Resume Builder</h3>
          <p>
            One click turns a student profile into an ATS-friendly PDF resume.
          </p>
        </div>
        <div className="card">
          <h3>Community Wall</h3>
          <p>
            Students and alumni share opportunities and insights inside a
            verified university network.
          </p>
        </div>
      </section>
    </div>
  );
}

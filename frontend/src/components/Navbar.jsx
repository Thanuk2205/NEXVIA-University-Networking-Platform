import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DASHBOARD_BY_ROLE = {
  student: "/dashboard/student",
  alumni: "/dashboard/student",
  company: "/dashboard/company",
  faculty: "/dashboard/faculty",
  admin: "/dashboard/admin",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        NEXVIA <span>The Next Way to a Smarter Pathway</span>
      </Link>
      <nav>
        <Link to="/jobs">Opportunities</Link>
        <Link to="/wall">Community Wall</Link>
        {user && (
          <Link to={DASHBOARD_BY_ROLE[user.role] || "/"}>Dashboard</Link>
        )}
        {user ? (
          <>
            <Link to="/profile">{user.name}</Link>
            <button
              className="link-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="cta">
              Get Started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

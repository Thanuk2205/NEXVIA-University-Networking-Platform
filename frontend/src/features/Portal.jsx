import {
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { Title, useAction, Flash } from "./shared";
import { AuthPage, AccountLink } from "./auth";
import ProfilePage from "./profiles";
import {
  Opportunities,
  Publisher,
  Applications,
  Candidates,
} from "./opportunities";
import { Notices, Dispatch } from "./notices";
import { Community, Alumni, Notifications } from "./network";
import CvPage from "./cv";
import AdminPage from "./admin";
import FeedDashboard, { ReceivedReferrals } from "./feed";
function Guard({ roles, approval = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <p role="status" className="loading">
        Opening your workspace…
      </p>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/dashboard" replace />;
  if (approval && (!user.emailVerified || user.approvalStatus !== "approved"))
    return <Navigate to="/profile" replace />;
  return <Outlet />;
}
function Layout() {
  const { user, logout } = useAuth();
  const action = useAction();
  const learner = ["student", "alumni"].includes(user.role),
    staff = ["faculty", "admin"].includes(user.role);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">N</span>NEXVIA
        </Link>
        <p className="sidebar-caption">Your next chapter starts here.</p>
        <nav aria-label="Main navigation">
          <NavLink to="/dashboard">Network feed</NavLink>
          <NavLink to="/profile">My profile</NavLink>
          <NavLink to="/opportunities">Opportunities</NavLink>
          {learner && (
            <>
              <NavLink to="/applications">My applications</NavLink>
              <NavLink to="/cv">CV studio</NavLink>
            </>
          )}
          {user.role === "employer" && (
            <>
              <NavLink to="/publish">My vacancies</NavLink>
              <NavLink to="/employer/candidates">Find candidates</NavLink>
            </>
          )}
          {staff && (
            <>
              <NavLink to="/publish">Publish opportunities</NavLink>
              <NavLink to="/notices">Academic notices</NavLink>
              <NavLink to="/dispatch">Dispatch guidance</NavLink>
            </>
          )}
          <NavLink to="/community">Community</NavLink>
          <NavLink to="/post-applications">Post applications</NavLink>
          {user.role !== "employer" && (
            <NavLink to="/alumni">Alumni network</NavLink>
          )}
          <NavLink to="/notifications">My inbox</NavLink>
          {user.role === "admin" && (
            <NavLink to="/admin">Administration</NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="badge">{user.role}</span>
          <p>{user.email}</p>
          <button
            className="secondary"
            disabled={action.busy}
            onClick={() => action.run(logout, "Signed out.")}
          >
            Sign out
          </button>
          <Flash error={action.error} />
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <span>University & career network</span>
          <Link to="/notifications">Inbox</Link>
        </header>
        <main id="main-content">
          <Outlet />
        </main>
        <footer>Built for meaningful academic and career connections.</footer>
      </div>
    </div>
  );
}
function Home() {
  return (
    <div className="landing">
      <header>
        <Link className="brand" to="/">
          NEXVIA
        </Link>
        <nav>
          <Link to="/login">Sign in</Link>
          <Link className="button" to="/register">
            Join the network
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <span className="eyebrow">LEARN. CONNECT. MOVE FORWARD.</span>
          <h1>
            Your university journey.
            <br />
            <em>Your next opportunity.</em>
          </h1>
          <p>
            Build your career profile, find relevant opportunities, and connect
            with a verified academic community.
          </p>
          <div className="actions">
            <Link className="button" to="/register">
              Create your profile →
            </Link>
            <Link className="button secondary" to="/login">
              Open your workspace
            </Link>
          </div>
        </section>
        <div className="feature-grid">
          {[
            [
              "01",
              "A profile that opens doors",
              "Bring your education, skills and projects into one place. Decide what you share.",
            ],
            [
              "02",
              "Opportunities with a reason",
              "Understand which requirements you meet and what to add to your profile.",
            ],
            [
              "03",
              "A community that moves together",
              "Connect with alumni, follow academic guidance and prepare your next CV.",
            ],
          ].map(([n, t, d]) => (
            <section className="card" key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{t}</h2>
              <p>{d}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
function Dashboard() {
  return <FeedDashboard />;
}
export default function Portal() {
  return (
    <AuthProvider>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route
          path="/forgot-password"
          element={<AccountLink kind="forgot" />}
        />
        <Route path="/verify-email" element={<AccountLink kind="verify" />} />
        <Route path="/reset-password" element={<AccountLink kind="reset" />} />
        <Route
          path="/accept-invitation"
          element={<AccountLink kind="invite" />}
        />
        <Route element={<Guard approval={false} />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route element={<Guard />}>
              <Route path="/opportunities" element={<Opportunities />} />
              <Route path="/community" element={<Community />} />
              <Route
                path="/post-applications"
                element={<ReceivedReferrals />}
              />
              <Route path="/alumni" element={<Alumni />} />
              <Route element={<Guard roles={["student", "alumni"]} />}>
                <Route path="/applications" element={<Applications />} />
                <Route path="/cv" element={<CvPage />} />
              </Route>
              <Route element={<Guard roles={["employer"]} />}>
                <Route path="/employer/candidates" element={<Candidates />} />
              </Route>
              <Route
                element={<Guard roles={["employer", "faculty", "admin"]} />}
              >
                <Route path="/publish" element={<Publisher />} />
              </Route>
              <Route element={<Guard roles={["faculty", "admin"]} />}>
                <Route path="/notices" element={<Notices />} />
                <Route path="/dispatch" element={<Dispatch />} />
              </Route>
              <Route element={<Guard roles={["admin"]} />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route
          path="/jobs"
          element={<Navigate to="/opportunities" replace />}
        />
        <Route path="/wall" element={<Navigate to="/community" replace />} />
        <Route
          path="/dashboard/:legacy"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="*"
          element={
            <div className="page">
              <Title title="Page not found" />
              <Link to="/dashboard">Back to your workspace</Link>
            </div>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

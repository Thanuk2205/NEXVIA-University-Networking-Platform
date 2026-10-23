import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { Field, Flash, Title, useAction } from "./shared";
export function AuthPage({ register = false }) {
  const auth = useAuth(),
    navigate = useNavigate(),
    action = useAction();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [fullName, setFullName] = useState(""),
    [role, setRole] = useState("student");
  async function submit(e) {
    e.preventDefault();
    const result = await action.run(() =>
      register
        ? auth.register({ email, password, fullName, role })
        : auth.login(email, password),
    );
    if (result) navigate(register ? "/profile" : "/dashboard");
  }
  return (
    <main id="main-content" className="auth-shell">
      <Link className="brand" to="/">
        NEXVIA
      </Link>
      <form className="card auth-form" onSubmit={submit}>
        <Title
          eyebrow="YOUR NEXT CHAPTER"
          title={register ? "Join Nexvia" : "Welcome back"}
        >
          {register
            ? "Create your account, verify your email and complete your academic or company review."
            : "Sign in to your university and career workspace."}
        </Title>
        <Flash error={action.error} />
        {register && (
          <>
            <Field label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
              />
            </Field>
            <Field label="Account type">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="alumni">Alumni</option>
                <option value="employer">Employer / recruiter</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field
          label="Password"
          hint={register ? "Use at least 12 characters." : ""}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={register ? 12 : 1}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </Field>
        <button disabled={action.busy}>
          {action.busy
            ? "Please wait…"
            : register
              ? "Create account"
              : "Sign in"}
        </button>
        <Link to={register ? "/login" : "/register"}>
          {register
            ? "Already have an account? Sign in"
            : "New to Nexvia? Create an account"}
        </Link>
        {!register && <Link to="/forgot-password">Forgot your password?</Link>}
      </form>
    </main>
  );
}
export function AccountLink({ kind }) {
  const action = useAction(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(
      () =>
        new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    ),
    [fullName, setFullName] = useState("");
  const titles = {
    forgot: "Recover your account",
    verify: "Verify your email",
    reset: "Set a new password",
    invite: "Accept faculty invitation",
  };
  async function submit(e) {
    e.preventDefault();
    const path = {
      forgot: "/auth/forgot-password",
      verify: "/auth/verify-email",
      reset: "/auth/reset-password",
      invite: "/auth/accept-invitation",
    }[kind];
    const body =
      kind === "forgot"
        ? { email }
        : kind === "verify"
          ? { token }
          : kind === "invite"
            ? { token, password, fullName }
            : { token, password };
    const result = await action.run(
      () => api.post(path, body),
      kind === "forgot"
        ? "If eligible, a recovery email has been queued."
        : "Completed. You can sign in to continue.",
    );
    if (result && kind !== "forgot")
      window.history.replaceState(null, "", window.location.pathname);
  }
  return (
    <main id="main-content" className="auth-shell">
      <Link className="brand" to="/">
        NEXVIA
      </Link>
      <form className="card auth-form" onSubmit={submit}>
        <Title title={titles[kind]} />
        <Flash error={action.error} message={action.message} />
        {kind === "forgot" ? (
          <Field label="Account email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
        ) : (
          <Field
            label={
              kind === "invite"
                ? "Invitation token"
                : "Verification or recovery token"
            }
          >
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        )}
        {kind === "invite" && (
          <Field label="Full name">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
            />
          </Field>
        )}
        {["reset", "invite"].includes(kind) && (
          <Field label="New password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
            />
          </Field>
        )}
        <button disabled={action.busy}>Continue</button>
        <Link to="/login">Back to sign in</Link>
      </form>
    </main>
  );
}

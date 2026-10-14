import {
  useCallback,
  useEffect,
  useState,
  useRef,
  useId,
  cloneElement,
} from "react";
import { Link } from "react-router-dom";
import api, { fetchData, errorMessage } from "../api/axios";
export function useResource(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await fetchData(url);
      if (request === sequence.current) setData(result);
    } catch (e) {
      if (request === sequence.current) setError(errorMessage(e));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);
  return { data, setData, error, loading, reload };
}
export function State({ resource, children }) {
  if (resource.loading)
    return (
      <p role="status" className="loading">
        Loading…
      </p>
    );
  if (resource.error)
    return (
      <div role="alert" className="error">
        {resource.error} <button onClick={resource.reload}>Try again</button>
      </div>
    );
  return children;
}
export function Field({ label, children, hint }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {cloneElement(children, {
        id,
        "aria-labelledby": `${id}-label`,
        ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function Flash({ error, message }) {
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </>
  );
}
export function useAction() {
  const running = useRef(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(work, success = "Saved successfully.") {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      setMessage(success);
      return result;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { error, message, busy, run };
}
export function Pager({ resource, url }) {
  const action = useAction();
  return (
    <>
      {resource.data?.nextCursor && (
        <button
          className="secondary"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              const data = await fetchData(
                `${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(resource.data.nextCursor)}`,
              );
              resource.setData({
                ...data,
                items: [...resource.data.items, ...data.items],
              });
            }, "")
          }
        >
          Load more
        </button>
      )}
      <Flash error={action.error} />
    </>
  );
}
export function Title({
  eyebrow = "YOUR UNIVERSITY NETWORK",
  title,
  children,
}) {
  return (
    <header className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
export function Empty({ children }) {
  return <p className="empty">{children || "No records yet."}</p>;
}
export function Checklist({ data }) {
  if (!data) return null;
  return (
    <section className="card">
      <h2>Profile checklist</h2>
      <div className="readiness">
        <span className={data.matchingReady ? "ready" : ""}>
          Opportunity matching: {data.matchingReady ? "ready" : "incomplete"}
        </span>
        <span className={data.cvExportReady ? "ready" : ""}>
          CV export: {data.cvExportReady ? "ready" : "incomplete"}
        </span>
        <span className={data.candidateDiscoveryReady ? "ready" : ""}>
          Employer discovery:{" "}
          {data.candidateDiscoveryReady ? "enabled" : "off or incomplete"}
        </span>
      </div>
      <ul className="checklist">
        {data.requirements.map((r) => (
          <li key={r.field}>
            <span aria-label={r.state}>
              {r.state === "completed" ? "✓" : "○"}
            </span>
            {r.message}
            {r.state !== "completed" && <Link to={r.editTarget}>Complete</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}

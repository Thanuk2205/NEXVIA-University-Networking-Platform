import { useState } from "react";
import api from "../api/axios";
import {
  useResource,
  useAction,
  State,
  Field,
  Flash,
  Empty,
  Pager,
} from "./shared";
export default function Operations() {
  const [service, setService] = useState("notification"),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [providerId, setProviderId] = useState("");
  const outbox = useResource(`/operations/${service}/outbox`),
    audit = useResource(`/operations/${service}/audit`),
    delivery = useResource("/admin/delivery-jobs"),
    action = useAction();
  return (
    <details className="card">
      <summary>Delivery recovery and audit history</summary>
      <Flash error={action.error} message={action.message} />
      <Field label="Recovery reason">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
        />
      </Field>
      <Field label="Evidence reference">
        <input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Provider message ID (for confirmed acceptance)">
        <input
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          maxLength={200}
        />
      </Field>
      <h3>Unresolved Gmail delivery</h3>
      <p>
        Check provider evidence before retrying an unknown outcome. Accepted
        messages cannot be recalled.
      </p>
      <button className="secondary" onClick={delivery.reload}>
        Refresh delivery jobs
      </button>
      <State resource={delivery}>
        {delivery.data?.items.length ? (
          delivery.data.items.map((job) => (
            <article className="entry" key={job._id}>
              <p>
                {job.kind} · {job.status} · {job.attempts} attempts
              </p>
              <p>{job.lastError}</p>
              {["confirmed_not_sent", "provider_accepted"].map((decision) => (
                <button
                  key={decision}
                  className="secondary"
                  disabled={
                    action.busy ||
                    reason.length < 3 ||
                    evidence.length < 3 ||
                    (decision === "provider_accepted" && !providerId)
                  }
                  onClick={() =>
                    action.run(async () => {
                      await api.post(
                        `/admin/delivery-jobs/${job._id}/reconcile`,
                        {
                          decision,
                          reason,
                          evidenceReference: evidence,
                          ...(providerId
                            ? { providerMessageId: providerId }
                            : {}),
                        },
                      );
                      await Promise.all([delivery.reload(), audit.reload()]);
                    }, "Delivery decision recorded.")
                  }
                >
                  {decision === "confirmed_not_sent"
                    ? "Confirmed not sent: retry"
                    : "Record provider acceptance"}
                </button>
              ))}
            </article>
          ))
        ) : (
          <Empty>No unresolved delivery jobs.</Empty>
        )}
        <Pager resource={delivery} url="/admin/delivery-jobs" />
      </State>
      <Field label="Service history">
        <select value={service} onChange={(e) => setService(e.target.value)}>
          {[
            "identity",
            "profile",
            "opportunity",
            "matching",
            "community",
            "notification",
            "cv",
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      <h3>Service event delivery</h3>
      <State resource={outbox}>
        {outbox.data?.items.map((event) => (
          <article className="entry" key={event._id}>
            <p>
              {event.type} · {event.status} · {event.attempts} attempts
            </p>
            {event.status === "failed" && (
              <button
                disabled={action.busy || reason.length < 3}
                onClick={() =>
                  action.run(async () => {
                    await api.post(
                      `/operations/${service}/outbox/${event._id}/retry`,
                      { reason },
                    );
                    await Promise.all([outbox.reload(), audit.reload()]);
                  }, "Event queued with its original identity.")
                }
              >
                Retry reviewed event
              </button>
            )}
          </article>
        ))}
        <Pager resource={outbox} url={`/operations/${service}/outbox`} />
      </State>
      <h3>Authorized audit history</h3>
      <State resource={audit}>
        {audit.data?.items.map((item) => (
          <p key={item._id}>
            {item.action} · {item.reason} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </p>
        ))}
        <Pager resource={audit} url={`/operations/${service}/audit`} />
      </State>
    </details>
  );
}

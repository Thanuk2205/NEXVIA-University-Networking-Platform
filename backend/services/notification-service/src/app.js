import {
  z,
  id,
  text,
  validate,
  fail,
  respond,
  asyncRoute,
  internal,
  paginate,
  page,
} from "@nexvia/platform-utils";
import { GmailProvider } from "./gmail.js";
export async function install(ctx) {
  const { app, model, auth, rpc, config } = ctx;
  const Notification = model("notifications", {
    recipientId: String,
    eventId: { type: String, unique: true },
    title: String,
    body: String,
    contentType: String,
    contentId: String,
    contentRevision: Number,
    resourceType: String,
    resourceId: String,
    dispatchId: String,
    readAt: Date,
  });
  const Preference = model("channel_preferences", {
    userId: { type: String, unique: true },
    opportunityEmail: { type: Boolean, default: false },
    applicationEmail: { type: Boolean, default: true },
    cvEmail: { type: Boolean, default: false },
  });
  const Job = model("delivery_jobs", {
    eventId: { type: String, unique: true },
    recipientId: String,
    kind: String,
    handle: String,
    title: String,
    body: String,
    dispatchId: String,
    contentType: String,
    contentId: String,
    criteria: Object,
    contentRevision: Number,
    status: { type: String, default: "queued" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: Date,
    lastError: String,
    providerMessageId: String,
  });
  const Attempt = model("delivery_attempts", {
    jobId: String,
    status: String,
    code: String,
  });
  Object.assign(ctx, { Notification, Preference, Job, Attempt });
  ctx.gmail = config.gmailProvider || new GmailProvider();
  const prefs = (userId) =>
    Preference.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { new: true, upsert: true },
    );
  app.get(
    "/api/v1/notifications",
    auth(),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const list = page(
        await Notification.find({ ...filter, recipientId: req.actor.userId })
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit + 1)
          .lean(),
        limit,
      );
      respond(res, {
        ...list,
        unreadCount: await Notification.countDocuments({
          recipientId: req.actor.userId,
          readAt: { $exists: false },
        }),
      });
    }),
  );
  app.patch(
    "/api/v1/notifications/:id/read",
    auth(),
    asyncRoute(async (req, res) => {
      const row = await Notification.findOneAndUpdate(
        { _id: validate(id, req.params.id), recipientId: req.actor.userId },
        { $set: { readAt: new Date() } },
        { new: true },
      );
      if (!row) fail(404, "NOT_FOUND", "Notification not found.");
      respond(res, row.toObject());
    }),
  );
  app.post(
    "/api/v1/notifications/read-all",
    auth(),
    asyncRoute(async (req, res) => {
      await Notification.updateMany(
        { recipientId: req.actor.userId, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
      );
      respond(res, { completed: true });
    }),
  );
  app.get(
    "/api/v1/notification-preferences",
    auth([], false),
    asyncRoute(async (req, res) =>
      respond(res, (await prefs(req.actor.userId)).toObject()),
    ),
  );
  app.patch(
    "/api/v1/notification-preferences",
    auth([], false),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            opportunityEmail: z.boolean().optional(),
            applicationEmail: z.boolean().optional(),
            cvEmail: z.boolean().optional(),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await Preference.findOneAndUpdate(
          { userId: req.actor.userId },
          { $set: b },
          { new: true, upsert: true },
        ),
      );
    }),
  );
  app.get(
    "/api/v1/notifications/delivery/me",
    auth([], false),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const rows = await Job.find({ ...filter, recipientId: req.actor.userId })
        .select("kind status attempts lastError createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      respond(res, page(rows, limit));
    }),
  );
  app.get(
    "/internal/summary",
    internal(config, ["gateway"]),
    auth(),
    asyncRoute(async (req, res) =>
      respond(res, {
        stats: [
          {
            label: "Your unread updates",
            value: await Notification.countDocuments({
              recipientId: req.actor.userId,
              readAt: { $exists: false },
            }),
          },
        ],
      }),
    ),
  );
  app.get(
    "/api/v1/admin/delivery-jobs",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const status = req.query.status
        ? validate(
            z.enum([
              "failed",
              "unknown",
              "blocked",
              "provider_accepted",
              "suppressed",
            ]),
            req.query.status,
          )
        : { $in: ["failed", "unknown", "blocked"] };
      respond(
        res,
        page(
          await Job.find({ ...filter, status })
            .select(
              "recipientId kind status attempts lastError providerMessageId createdAt",
            )
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/api/v1/admin/delivery-jobs/:id/reconcile",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            decision: z.enum(["provider_accepted", "confirmed_not_sent"]),
            reason: text(1000, 3),
            evidenceReference: text(200, 3),
            providerMessageId: text(200, 1).optional(),
          })
          .strict(),
        req.body,
      );
      if (b.decision === "provider_accepted" && !b.providerMessageId)
        fail(
          400,
          "PROVIDER_EVIDENCE",
          "Record the accepted provider message ID.",
        );
      respond(
        res,
        await ctx.command(
          req,
          async (session) => {
            const row = await Job.findOneAndUpdate(
              {
                _id: validate(id, req.params.id),
                status: { $in: ["unknown", "failed", "blocked"] },
              },
              {
                $set:
                  b.decision === "provider_accepted"
                    ? {
                        status: "provider_accepted",
                        providerMessageId: b.providerMessageId,
                      }
                    : {
                        status: "queued",
                        nextAttemptAt: new Date(),
                        attempts: 0,
                      },
                $unset: { leaseUntil: 1, lastError: 1 },
              },
              { session, new: true },
            );
            if (!row)
              fail(
                409,
                "DELIVERY_STATE",
                "Only unresolved delivery jobs can be reconciled.",
              );
            await ctx.audit(
              session,
              req.actor,
              "delivery.reconcile",
              row._id,
              `${b.reason}; evidence: ${b.evidenceReference}; decision: ${b.decision}`,
            );
            await Attempt.create(
              [
                {
                  jobId: String(row._id),
                  status: row.status,
                  code: "MANUAL_RECONCILIATION",
                },
              ],
              { session },
            );
            return { jobId: row._id, status: row.status };
          },
          true,
        ),
      );
    }),
  );
  app.get(
    "/internal/dispatches/:id/summary",
    internal(config, ["matching"]),
    asyncRoute(async (req, res) => {
      const dispatchId = validate(id, req.params.id);
      const jobs = await Job.aggregate([
        { $match: { dispatchId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      respond(res, {
        persisted: await Notification.countDocuments({ dispatchId }),
        email: Object.fromEntries(jobs.map((s) => [s._id, s.count])),
      });
    }),
  );
  async function receive(e, session, kind) {
    const data = e.data;
    const eventId = `${e.eventId}:${data.userId}`;
    if (!data.userId || typeof data.userId !== "string")
      fail(400, "EVENT_CONTRACT", "A recipient is required.");
    const account = await rpc("identity", `/internal/accounts/${data.userId}`);
    if (
      !account.isActive ||
      (!["verify", "reset"].includes(kind) &&
        (!account.emailVerified || account.approvalStatus !== "approved"))
    )
      return;
    if (!["verify", "reset"].includes(kind))
      await Notification.create(
        [
          {
            eventId,
            recipientId: data.userId,
            title: data.title,
            body: data.body,
            contentType: data.contentType,
            contentId: data.contentId,
            contentRevision: data.contentRevision,
            dispatchId: data.dispatchId,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
          },
        ],
        { session },
      );
    await Job.create(
      [
        {
          eventId,
          recipientId: data.userId,
          kind,
          handle: data.handle,
          title: data.title,
          body: data.body,
          dispatchId: data.dispatchId,
          contentType: data.contentType,
          contentId: data.contentId,
          contentRevision: data.contentRevision,
          criteria: data.criteria,
        },
      ],
      { session },
    );
  }
  const deletion = async (e, session) => {
    await Job.updateMany(
      { recipientId: e.data.userId, status: { $in: ["queued", "blocked"] } },
      { $set: { status: "cancelled" } },
      { session },
    );
    await Notification.deleteMany({ recipientId: e.data.userId }, { session });
  };
  ctx.handlers.identity = {
    "VerificationEmailRequested.v1": (e, s) => receive(e, s, "verify"),
    "PasswordResetRequested.v1": (e, s) => receive(e, s, "reset"),
    "AccountDeletionRequested.v1": deletion,
  };
  ctx.handlers.matching = {
    "DispatchNotificationRequested.v1": (e, s) => receive(e, s, "opportunity"),
  };
  ctx.handlers.opportunity = {
    "ApplicationStatusChanged.v1": (e, s) => receive(e, s, "application"),
    "AcademicNoticePublished.v1": async () => {},
    "AcademicNoticeUpdated.v1": async () => {},
    "AcademicNoticeArchived.v1": async (e, s) => {
      await Job.updateMany(
        { contentId: e.data.contentId, status: { $in: ["queued", "blocked"] } },
        { $set: { status: "suppressed" } },
        { session: s },
      );
    },
  };
  ctx.handlers.cv = {
    "CvGenerationCompleted.v1": (e, s) => receive(e, s, "cv"),
  };
  ctx.handlers.community = {
    "PostApplicationSubmitted.v1": (e, s) => receive(e, s, "application"),
    "PostApplicationStatusChanged.v1": (e, s) => receive(e, s, "application"),
  };
  ctx.workers.push(async () => {
    await Job.updateMany(
      { status: "running", leaseUntil: { $lt: new Date() } },
      { $set: { status: "unknown", lastError: "WORKER_INTERRUPTED" } },
    );
    const job = await Job.findOneAndUpdate(
      {
        status: { $in: ["queued", "blocked"] },
        nextAttemptAt: { $lte: new Date() },
      },
      {
        $set: { status: "running", leaseUntil: new Date(Date.now() + 30000) },
        $inc: { attempts: 1 },
      },
      { new: true },
    ).lean();
    if (!job) return;
    let result;
    try {
      const contact = await rpc(
        "identity",
        `/internal/contacts/${job.recipientId}`,
      );
      if (!contact.isActive) result = { status: "suppressed" };
      else {
        const transactional = ["verify", "reset"].includes(job.kind);
        const pref = await prefs(job.recipientId);
        const allowed =
          transactional ||
          (job.kind === "application" && pref.applicationEmail) ||
          (job.kind === "cv" && pref.cvEmail) ||
          (job.kind === "opportunity" && pref.opportunityEmail);
        if (
          !allowed ||
          (!transactional &&
            (!contact.emailVerified || contact.approvalStatus !== "approved"))
        )
          result = { status: "suppressed" };
        if (!result && job.contentId) {
          const c = await rpc(
            "opportunity",
            `/internal/content/${job.contentType}/${job.contentId}`,
          );
          if (
            c.status !== "published" ||
            (job.contentRevision && c.revision !== job.contentRevision) ||
            (c.expiresAt && new Date(c.expiresAt) <= new Date()) ||
            (c.deadline && new Date(c.deadline) <= new Date())
          )
            result = { status: "suppressed" };
        }
        if (!result && job.dispatchId) {
          const current = await rpc(
            "profile",
            "/internal/recipient-eligibility",
            {
              method: "POST",
              body: { userId: job.recipientId, criteria: job.criteria || {} },
            },
          );
          if (!current.eligible) result = { status: "suppressed" };
        }
        if (!result) {
          let title = job.title,
            body = job.body;
          if (transactional) {
            const payload = await rpc(
              "identity",
              `/internal/mail-requests/${job.handle}`,
            );
            title =
              job.kind === "verify"
                ? "Verify your Nexvia email"
                : "Reset your Nexvia password";
            body = `${title}: ${config.origin}/${job.kind === "verify" ? "verify-email" : "reset-password"}#token=${payload.token}\nThis link is private and expires automatically.`;
          }
          result = await ctx.gmail.send({
            email: contact.email,
            subject: title,
            body,
            messageId: job.eventId.replace(/[^\w-]/g, "-"),
          });
        }
      }
    } catch (e) {
      result = {
        status: e.unknown
          ? "unknown"
          : e.code === "PROVIDER_NOT_CONFIGURED"
            ? "blocked"
            : e.status === 410
              ? "suppressed"
              : (e.retryable || e.status === 503) && job.attempts < 8
                ? "queued"
                : "failed",
        lastError: e.code || "PROVIDER_ERROR",
        nextAttemptAt: new Date(
          Date.now() +
            (e.code === "PROVIDER_NOT_CONFIGURED"
              ? 60000
              : Math.min(300000, 1000 * 2 ** job.attempts)),
        ),
      };
    }
    await Job.updateOne(
      { _id: job._id, status: "running", leaseUntil: job.leaseUntil },
      { $set: result, $unset: { leaseUntil: 1 } },
    );
    await Attempt.create({
      jobId: String(job._id),
      status: result.status,
      code: result.lastError,
    });
  });
}

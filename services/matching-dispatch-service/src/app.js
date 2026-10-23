import crypto from "node:crypto";
import {
  z,
  id,
  scopeSchema,
  validate,
  fail,
  respond,
  asyncRoute,
  userToken,
  assertScope,
  paginate,
  page,
} from "@nexvia/platform-utils";
import { match, ruleVersion } from "./domain.js";
const hashRecipients = (rows) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((r) => [r.userId, r.profileVersion])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    )
    .digest("hex");
export async function install(ctx) {
  const { app, model, auth, rpc } = ctx;
  const Run = model("match_runs", {
    opportunityId: { type: String, unique: true },
    organizationId: String,
    opportunityRevision: Number,
    status: { type: String, default: "queued" },
    results: Array,
    context: { type: String, default: "employer" },
    ruleVersion: String,
    leaseUntil: Date,
    lastError: String,
  });
  const Preview = model(
    "dispatch_previews",
    {
      senderId: String,
      contentType: String,
      contentId: String,
      contentRevision: Number,
      criteria: Object,
      recipients: Array,
      recipientsHash: String,
      expiresAt: Date,
    },
    [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  );
  const Dispatch = model(
    "dispatches",
    {
      previewId: String,
      senderId: String,
      contentType: String,
      contentId: String,
      contentRevision: Number,
      criteria: Object,
      title: String,
      body: String,
      status: { type: String, default: "queued" },
      total: Number,
    },
    [
      [
        { previewId: 1 },
        {
          unique: true,
          partialFilterExpression: { previewId: { $type: "string" } },
        },
      ],
    ],
  );
  const Recipient = model(
    "dispatch_recipients",
    {
      dispatchId: String,
      userId: String,
      status: { type: String, default: "queued" },
    },
    [[{ dispatchId: 1, userId: 1 }, { unique: true }]],
  );
  Object.assign(ctx, { Run, Preview, Dispatch, Recipient });
  async function recipients(req, criteria) {
    let result = [],
      offset = 0;
    do {
      const p = await rpc("profile", "/internal/recipients", {
        method: "POST",
        body: { criteria, offset },
        actor: userToken(req),
      });
      result.push(...p.items);
      offset = p.nextOffset;
      if (result.length > 1000)
        fail(
          400,
          "DISPATCH_LIMIT",
          "Narrow the audience to at most 1,000 recipients.",
        );
    } while (offset !== null);
    return result;
  }
  async function content(type, id, req) {
    const c = await rpc("opportunity", `/internal/content/${type}/${id}`, {
      actor: userToken(req),
    });
    if (
      c.status !== "published" ||
      (c.expiresAt && new Date(c.expiresAt) <= new Date()) ||
      (c.deadline && new Date(c.deadline) <= new Date())
    )
      fail(
        409,
        "CONTENT_UNAVAILABLE",
        "Only currently published, unexpired content can be dispatched.",
      );
    return c;
  }
  app.get(
    "/api/v1/recommendations/me",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const p = await rpc("profile", "/internal/owner-snapshot", {
        actor: userToken(req),
      });
      if (!p.completion.matchingReady)
        fail(
          409,
          "PROFILE_INCOMPLETE",
          "Use the profile checklist to complete matching requirements.",
        );
      if (req.actor.role === "alumni") delete p.academicYear;
      const list = await rpc(
        "opportunity",
        `/internal/opportunities?${new URLSearchParams(req.query)}`,
      );
      respond(res, {
        ...list,
        items: list.items
          .map((opportunity) => ({
            opportunity,
            explanation: match(p, opportunity),
          }))
          .sort(
            (a, b) => (b.explanation.score || 0) - (a.explanation.score || 0),
          ),
      });
    }),
  );
  app.get(
    "/api/v1/opportunities/:id/candidates",
    auth(["employer"]),
    asyncRoute(async (req, res) => {
      const o = await rpc(
        "opportunity",
        `/internal/opportunities/${validate(id, req.params.id)}`,
        { actor: userToken(req) },
      );
      const run = await Run.findOne({ opportunityId: String(o._id) }).lean();
      if (
        !run ||
        run.status !== "completed" ||
        run.opportunityRevision !== o.revision
      ) {
        respond(
          res,
          { status: run?.status || "pending", runId: run?._id, items: [] },
          202,
        );
        return;
      }
      const results = [];
      for (const row of run.results || []) {
        try {
          const current = await rpc(
            "profile",
            `/internal/candidates/${row.userId}`,
            { actor: userToken(req) },
          );
          const explanation = match(current, o);
          if (explanation.eligibilityStatus === "eligible")
            results.push({ candidate: current, explanation });
        } catch (e) {
          if (![403, 404].includes(e.status)) throw e;
        }
      }
      respond(res, {
        status: "completed",
        runId: run._id,
        items: results.sort(
          (a, b) =>
            (b.explanation.score || 0) - (a.explanation.score || 0) ||
            a.candidate.userId.localeCompare(b.candidate.userId),
        ),
      });
    }),
  );
  app.get(
    "/api/v1/match-runs/:id",
    auth(["employer"]),
    asyncRoute(async (req, res) => {
      const r = await Run.findById(validate(id, req.params.id)).lean();
      if (!r) fail(404, "NOT_FOUND", "Match run not found.");
      await rpc("opportunity", `/internal/opportunities/${r.opportunityId}`, {
        actor: userToken(req),
      });
      respond(res, {
        id: r._id,
        status: r.status,
        opportunityRevision: r.opportunityRevision,
        ruleVersion: r.ruleVersion,
      });
    }),
  );
  app.post(
    "/api/v1/dispatches/preview",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            contentType: z.enum(["academic_notice", "opportunity"]),
            contentId: id,
            criteria: scopeSchema,
            universityWide: z.boolean().default(false),
          })
          .strict(),
        req.body,
      );
      if (b.universityWide && req.actor.role !== "admin")
        fail(
          403,
          "SCOPE",
          "University-wide dispatch requires administrator authority.",
        );
      const c = await content(b.contentType, b.contentId, req);
      for (const [k, v] of Object.entries(c.scope || {}))
        if (b.criteria[k] !== undefined && b.criteria[k] !== v)
          fail(
            403,
            "CONTENT_SCOPE",
            "The audience must be within the content scope.",
          );
      const criteria = assertScope(req.actor, { ...b.criteria, ...c.scope });
      await rpc("profile", "/internal/validate-taxonomy", {
        method: "POST",
        body: { scope: criteria },
      });
      if (
        req.actor.role === "admin" &&
        !Object.keys(criteria).length &&
        !b.universityWide
      )
        fail(
          400,
          "BROADCAST_CONFIRMATION",
          "Explicitly select university-wide dispatch or narrow the audience.",
        );
      const rows = await recipients(req, criteria);
      const preview = await Preview.create({
        senderId: req.actor.userId,
        contentType: b.contentType,
        contentId: b.contentId,
        contentRevision: c.revision,
        criteria,
        recipients: rows,
        recipientsHash: hashRecipients(rows),
        expiresAt: new Date(Date.now() + 10 * 60000),
      });
      respond(
        res,
        {
          previewId: preview._id,
          count: rows.length,
          criteria,
          expiresAt: preview.expiresAt,
          contentRevision: c.revision,
          ruleExplanation:
            "Active approved students within the authorized academic audience.",
        },
        201,
      );
    }),
  );
  app.post(
    "/api/v1/dispatches",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(z.object({ previewId: id }).strict(), req.body);
      const previous = await Dispatch.findOne({
        previewId: b.previewId,
        senderId: req.actor.userId,
      }).lean();
      if (previous) {
        respond(
          res,
          {
            dispatchId: String(previous._id),
            status: previous.status,
            statusUrl: `/api/v1/dispatches/${previous._id}`,
          },
          202,
        );
        return;
      }
      const p = await Preview.findOne({
        _id: b.previewId,
        senderId: req.actor.userId,
        expiresAt: { $gt: new Date() },
      }).lean();
      if (!p) fail(409, "PREVIEW_EXPIRED", "Create a new dispatch preview.");
      assertScope(req.actor, p.criteria);
      const c = await content(p.contentType, p.contentId, req);
      if (c.revision !== p.contentRevision)
        fail(409, "PREVIEW_STALE", "Content changed. Review a new preview.");
      const current = await recipients(req, p.criteria);
      if (hashRecipients(current) !== p.recipientsHash)
        fail(
          409,
          "AUDIENCE_CHANGED",
          "Recipient membership changed. Review a new preview.",
        );
      respond(
        res,
        await ctx.command(
          req,
          async (session) => {
            const [d] = await Dispatch.create(
              [
                {
                  senderId: req.actor.userId,
                  previewId: b.previewId,
                  contentType: p.contentType,
                  contentId: p.contentId,
                  contentRevision: p.contentRevision,
                  criteria: p.criteria,
                  title: c.title,
                  body: c.body || c.description,
                  total: current.length,
                },
              ],
              { session },
            );
            if (current.length)
              await Recipient.insertMany(
                current.map((r) => ({
                  dispatchId: String(d._id),
                  userId: r.userId,
                })),
                { session },
              );
            await ctx.audit(
              session,
              req.actor,
              "dispatch.confirm",
              d._id,
              "Confirmed audience preview",
            );
            return {
              dispatchId: String(d._id),
              status: "queued",
              statusUrl: `/api/v1/dispatches/${d._id}`,
            };
          },
          true,
        ),
        202,
      );
    }),
  );
  app.get(
    "/api/v1/dispatches",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Dispatch.find({ ...filter, senderId: req.actor.userId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.get(
    "/api/v1/dispatches/:id",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const d = await Dispatch.findOne({
        _id: validate(id, req.params.id),
        senderId: req.actor.userId,
      }).lean();
      if (!d) fail(404, "NOT_FOUND", "Dispatch not found.");
      const statuses = await Recipient.aggregate([
        { $match: { dispatchId: String(d._id) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      let delivery;
      try {
        delivery = await rpc(
          "notification",
          `/internal/dispatches/${d._id}/summary`,
        );
      } catch {
        delivery = { status: "temporarily_unavailable" };
      }
      respond(res, {
        ...d,
        recipientProgress: Object.fromEntries(
          statuses.map((s) => [s._id, s.count]),
        ),
        delivery,
      });
    }),
  );
  app.post(
    "/api/v1/dispatches/:id/cancel",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) =>
      respond(
        res,
        await ctx.command(req, async (session) => {
          const d = await Dispatch.findOneAndUpdate(
            {
              _id: validate(id, req.params.id),
              senderId: req.actor.userId,
              status: { $in: ["queued", "processing"] },
            },
            { $set: { status: "cancelled" } },
            { new: true, session },
          );
          if (!d)
            fail(
              409,
              "DISPATCH_STATE",
              "This dispatch can no longer be cancelled.",
            );
          await Recipient.updateMany(
            { dispatchId: String(d._id), status: "queued" },
            { $set: { status: "cancelled" } },
            { session },
          );
          return d.toObject();
        }),
      ),
    ),
  );
  ctx.workers.push(async () => {
    const run = await Run.findOneAndUpdate(
      {
        status: { $in: ["queued", "running"] },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: { status: "running", leaseUntil: new Date(Date.now() + 120000) },
      },
      { new: true },
    ).lean();
    if (run) {
      try {
        const o = await rpc(
          "opportunity",
          `/internal/opportunities/${run.opportunityId}`,
        );
        let cursor,
          found = [];
        if (o.status === "published" && o.publisherType === "employer") {
          do {
            const rows = await rpc(
              "profile",
              `/internal/recommendation-candidates?organizationId=${o.organizationId}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            );
            for (const p of rows.items) {
              const explanation = match(p, o);
              if (explanation.eligibilityStatus === "eligible")
                found.push({
                  userId: p.userId,
                  score: explanation.score,
                  profileVersion: p.profileVersion,
                });
            }
            found.sort(
              (a, b) =>
                (b.score || 0) - (a.score || 0) ||
                a.userId.localeCompare(b.userId),
            );
            found = found.slice(0, 20);
            cursor = rows.nextCursor;
          } while (cursor);
        }
        await Run.updateOne(
          {
            _id: run._id,
            status: "running",
            leaseUntil: run.leaseUntil,
            opportunityRevision: run.opportunityRevision,
          },
          {
            $set: {
              status: "completed",
              opportunityRevision: o.revision,
              results: found,
              ruleVersion,
            },
            $unset: { leaseUntil: 1 },
          },
        );
      } catch (e) {
        await Run.updateOne(
          {
            _id: run._id,
            status: "running",
            leaseUntil: run.leaseUntil,
            opportunityRevision: run.opportunityRevision,
          },
          {
            $set: {
              status: e.status === 503 ? "queued" : "failed",
              lastError: e.code,
            },
            $unset: { leaseUntil: 1 },
          },
        );
      }
    }
    const d = await Dispatch.findOne({
      status: { $in: ["queued", "processing"] },
    }).lean();
    if (!d) return;
    const c = await rpc(
      "opportunity",
      `/internal/content/${d.contentType}/${d.contentId}`,
    );
    if (
      c.status !== "published" ||
      c.revision !== d.contentRevision ||
      (c.expiresAt && new Date(c.expiresAt) <= new Date()) ||
      (c.deadline && new Date(c.deadline) <= new Date())
    ) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { status: "cancelled" } },
      );
      await Recipient.updateMany(
        { dispatchId: String(d._id), status: "queued" },
        { $set: { status: "suppressed" } },
      );
      return;
    }
    const rows = await Recipient.find({
      dispatchId: String(d._id),
      status: "queued",
    })
      .limit(50)
      .lean();
    for (const row of rows) {
      const eligibility = await rpc(
        "profile",
        "/internal/recipient-eligibility",
        { method: "POST", body: { userId: row.userId, criteria: d.criteria } },
      );
      await ctx.transaction(async (session) => {
        // Touch the dispatch in the same transaction to serialize against cancellation.
        const active = await Dispatch.findOneAndUpdate(
          { _id: d._id, status: { $in: ["queued", "processing"] } },
          { $set: { status: "processing" } },
          { session, new: true },
        );
        if (!active) return;
        const r = await Recipient.findOneAndUpdate(
          { _id: row._id, status: "queued" },
          {
            $set: {
              status: eligibility.eligible ? "handed_off" : "suppressed",
            },
          },
          { new: true, session },
        );
        if (r?.status === "handed_off")
          await ctx.emit(
            session,
            "notification",
            "DispatchNotificationRequested.v1",
            d._id,
            1,
            {
              dispatchId: String(d._id),
              userId: row.userId,
              title: d.title,
              body: d.body,
              contentType: d.contentType,
              contentId: d.contentId,
              contentRevision: d.contentRevision,
              criteria: d.criteria,
            },
          );
      });
    }
    await Dispatch.updateOne(
      { _id: d._id, status: { $ne: "cancelled" } },
      { $set: { status: rows.length ? "processing" : "completed" } },
    );
  });
  async function queue(e, session) {
    await Run.updateOne(
      { opportunityId: e.data.opportunityId },
      {
        $set: { status: "queued", opportunityRevision: e.revision },
        $unset: { leaseUntil: 1 },
        $setOnInsert: { opportunityId: e.data.opportunityId },
      },
      { upsert: true, session },
    );
  }
  async function invalidate(e, session) {
    await Run.updateMany(
      { status: "completed" },
      { $set: { status: "queued" } },
      { session },
    );
  }
  ctx.handlers.opportunity = {
    "OpportunityPublished.v1": queue,
    "OpportunityUpdated.v1": queue,
    "OpportunityClosed.v1": queue,
    "AcademicNoticePublished.v1": async () => {},
    "AcademicNoticeUpdated.v1": async () => {},
    "AcademicNoticeArchived.v1": async () => {},
  };
  ctx.handlers.profile = { "ProfileMatchingChanged.v1": invalidate };
  ctx.handlers.identity = {
    "AccountEligibilityChanged.v1": invalidate,
    "AccountDeletionRequested.v1": invalidate,
  };
}

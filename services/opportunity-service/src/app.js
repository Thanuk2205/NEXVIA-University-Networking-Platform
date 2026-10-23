import {
  z,
  id,
  text,
  validate,
  fail,
  respond,
  asyncRoute,
  internal,
  userToken,
  assertScope,
  withinScope,
  paginate,
  page,
} from "@nexvia/platform-utils";
import {
  opportunitySchema,
  noticeSchema,
  checkTransition,
  actionable,
} from "./domain.js";
export async function install(ctx) {
  const { app, model, auth, config, rpc } = ctx;
  const Opportunity = model("opportunities", {
    title: String,
    description: String,
    kind: String,
    employmentType: String,
    location: String,
    applicationMethod: String,
    applicationUrl: String,
    deadline: Date,
    scope: Object,
    eligibleRoles: [String],
    mandatorySkills: [String],
    skillMode: String,
    preferredSkills: [String],
    preferredDegrees: [String],
    preferredAchievementKinds: [String],
    publisherType: String,
    organizationId: String,
    organizationName: String,
    createdByUserId: String,
    status: { type: String, default: "draft" },
    revision: { type: Number, default: 1 },
    submissionSerial: { type: Number, default: 0 },
    publishedAt: Date,
  });
  const Notice = model("academic_notices", {
    title: String,
    body: String,
    category: String,
    scope: Object,
    relatedOpportunityId: String,
    referenceUrl: String,
    expiresAt: Date,
    createdByUserId: String,
    publisherRole: String,
    status: { type: String, default: "draft" },
    revision: { type: Number, default: 1 },
    publishedAt: Date,
    archivedAt: Date,
  });
  const Application = model(
    "applications",
    {
      opportunityId: String,
      applicantId: String,
      organizationId: String,
      opportunityTitle: String,
      status: { type: String, default: "submitted" },
      profileSnapshot: Object,
      cvSnapshot: Object,
      history: Array,
      consentAt: Date,
      opportunityRevision: Number,
    },
    [[{ opportunityId: 1, applicantId: 1 }, { unique: true }]],
  );
  Object.assign(ctx, { Opportunity, Notice, Application });
  const org = (req) =>
    rpc("profile", "/internal/organizations/me", { actor: userToken(req) });
  const validateReferences = (body) =>
    rpc("profile", "/internal/validate-taxonomy", {
      method: "POST",
      body: {
        scope: body.scope,
        skillIds: [
          ...(body.mandatorySkills || []),
          ...(body.preferredSkills || []),
        ],
        degreeIds: body.preferredDegrees || [],
      },
    });
  async function auditOverride(req, session, item, action) {
    if (req.overrideReason)
      await ctx.audit(session, req.actor, action, item._id, req.overrideReason);
  }
  async function manage(req, item, notice = false) {
    if (req.actor.role === "admin") {
      if (
        !["GET", "HEAD"].includes(req.method) &&
        item.createdByUserId !== req.actor.userId
      )
        req.overrideReason = validate(
          text(1000, 3),
          req.headers["x-change-reason"],
        );
      return;
    }
    if (notice || item.publisherType === "university") {
      if (
        req.actor.role !== "faculty" ||
        item.createdByUserId !== req.actor.userId
      )
        fail(403, "OWNERSHIP", "You cannot manage this content.");
      assertScope(req.actor, item.scope);
      return;
    }
    const o = await org(req);
    if (o._id !== item.organizationId)
      fail(403, "OWNERSHIP", "This vacancy belongs to another organization.");
  }
  async function visible(req, item, notice = false) {
    if (item.status !== "published") {
      await manage(req, item, notice);
      return;
    }
    if (notice && ["student", "alumni"].includes(req.actor.role)) {
      const p = await rpc("profile", "/internal/owner-snapshot", {
        actor: userToken(req),
      });
      if (!withinScope(item.scope, p) || req.actor.role !== "student")
        fail(
          404,
          "NOT_FOUND",
          "Notice is unavailable to your current audience.",
        );
    } else if (notice && req.actor.role === "employer")
      fail(403, "AUDIENCE", "Academic notices are university content.");
    if (notice && item.expiresAt && item.expiresAt < new Date())
      fail(404, "NOT_FOUND", "Notice has expired.");
  }
  function expectedRevision(req, item) {
    const match = req.headers["if-match"];
    if (
      match === undefined ||
      Number(String(match).replaceAll('"', "")) !== item.revision
    )
      fail(
        412,
        "STALE_CONTENT",
        "Reload the current content before making this change.",
      );
  }
  app.get(
    "/api/v1/opportunities",
    auth(),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      let find = { ...filter, status: "published" };
      if (req.query.kind)
        find.kind = validate(
          z.enum(["internship", "job", "academic", "career", "event"]),
          req.query.kind,
        );
      if (req.query.view === "managed") {
        if (req.actor.role === "employer") {
          const o = await org(req);
          find.organizationId = o._id;
          delete find.status;
        } else if (["faculty", "admin"].includes(req.actor.role)) {
          find.createdByUserId = req.actor.userId;
          delete find.status;
        } else fail(403, "ROLE", "Publisher access is required.");
      }
      respond(
        res,
        page(
          await Opportunity.find(find)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/api/v1/opportunities",
    auth(["employer", "faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(opportunitySchema, req.body);
      const employer = req.actor.role === "employer";
      if (!employer && b.applicationMethod === "internal")
        fail(
          400,
          "UNIVERSITY_EXTERNAL",
          "University opportunities use external links or information-only methods.",
        );
      const o = employer ? await org(req) : null;
      const scope = employer ? b.scope : assertScope(req.actor, b.scope);
      await validateReferences({ ...b, scope });
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [v] = await Opportunity.create(
            [
              {
                ...b,
                scope,
                publisherType: employer ? "employer" : "university",
                organizationId: o?._id,
                organizationName: o?.organizationName,
                createdByUserId: req.actor.userId,
              },
            ],
            { session },
          );
          return v.toObject();
        }),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/opportunities/:id",
    auth(),
    asyncRoute(async (req, res) => {
      const o = await Opportunity.findById(validate(id, req.params.id)).lean();
      if (!o) fail(404, "NOT_FOUND", "Opportunity not found.");
      await visible(req, o);
      res.set("ETag", `"${o.revision}"`);
      respond(res, o);
    }),
  );
  app.patch(
    "/api/v1/opportunities/:id",
    auth(["employer", "faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const o = await Opportunity.findById(validate(id, req.params.id)).lean();
      if (!o) fail(404, "NOT_FOUND", "Opportunity not found.");
      await manage(req, o);
      if (o.status === "closed")
        fail(
          409,
          "LIFECYCLE",
          "Closed opportunities retain their submitted history and cannot be edited.",
        );
      expectedRevision(req, o);
      const b = validate(opportunitySchema, req.body);
      if (
        o.publisherType === "university" &&
        b.applicationMethod === "internal"
      )
        fail(
          400,
          "UNIVERSITY_EXTERNAL",
          "University opportunities use external applications.",
        );
      if (req.actor.role === "faculty")
        b.scope = assertScope(req.actor, b.scope);
      await validateReferences(b);
      respond(
        res,
        await ctx.command(req, async (session) => {
          const updated = await Opportunity.findOneAndUpdate(
            { _id: o._id, revision: o.revision },
            { $set: b, $unset: Object.fromEntries(["deadline","applicationUrl","location","employmentType"].filter(key=>b[key]===undefined).map(key=>[key,1])), $inc: { revision: 1 } },
            { new: true, session },
          );
          if (!updated) fail(412, "STALE_CONTENT", "Reload the opportunity.");
          await auditOverride(req, session, o, "opportunity.override_edit");
          await ctx.emit(
            session,
            "matching",
            "OpportunityUpdated.v1",
            o._id,
            updated.revision,
            { opportunityId: String(o._id) },
          );
          return updated.toObject();
        }),
      );
    }),
  );
  for (const action of ["publish", "close"])
    app.post(
      `/api/v1/opportunities/:id/${action}`,
      auth(["employer", "faculty", "admin"]),
      asyncRoute(async (req, res) => {
        const o = await Opportunity.findById(
          validate(id, req.params.id),
        ).lean();
        if (!o) fail(404, "NOT_FOUND", "Opportunity not found.");
        await manage(req, o);
        if (
          action === "publish" &&
          o.deadline &&
          new Date(o.deadline) <= new Date()
        )
          fail(409, "DEADLINE", "Choose a future deadline before publishing.");
        respond(
          res,
          await ctx.command(
            req,
            async (session) => {
              const updated = await Opportunity.findOneAndUpdate(
                {
                  _id: o._id,
                  revision: o.revision,
                  status: action === "publish" ? "draft" : "published",
                },
                {
                  $set: {
                    status: action === "publish" ? "published" : "closed",
                    ...(action === "publish"
                      ? { publishedAt: new Date() }
                      : {}),
                  },
                  $inc: { revision: 1 },
                },
                { new: true, session },
              );
              if (!updated)
                fail(
                  409,
                  "LIFECYCLE",
                  "Content is no longer in the expected state.",
                );
              await ctx.emit(
                session,
                "matching",
                action === "publish"
                  ? "OpportunityPublished.v1"
                  : "OpportunityClosed.v1",
                o._id,
                updated.revision,
                { opportunityId: String(o._id) },
              );
              await auditOverride(
                req,
                session,
                o,
                `opportunity.override_${action}`,
              );
              return updated.toObject();
            },
            true,
          ),
        );
      }),
    );
  app.get(
    "/api/v1/applications/me",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Application.find({ ...filter, applicantId: req.actor.userId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/api/v1/opportunities/:id/applications",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            consent: z.literal(true),
            cvDocumentId: id.optional(),
            opportunityRevision: z.number().int(),
          })
          .strict(),
        req.body,
      );
      const o = await Opportunity.findById(validate(id, req.params.id)).lean();
      if (
        !o ||
        o.publisherType !== "employer" ||
        o.applicationMethod !== "internal"
      )
        fail(
          409,
          "APPLICATION_METHOD",
          "This opportunity does not accept internal applications.",
        );
      if (!actionable(o))
        fail(
          409,
          "OPPORTUNITY_CLOSED",
          "The application deadline has passed or the vacancy is closed.",
        );
      if (o.revision !== b.opportunityRevision)
        fail(
          412,
          "STALE_CONTENT",
          "Review the updated opportunity before applying.",
        );
      await rpc(
        "profile",
        `/internal/organizations/${o.organizationId}/status`,
      );
      const p = await rpc("profile", "/internal/owner-snapshot", {
        actor: userToken(req),
      });
      if (req.actor.role === "alumni") delete p.academicYear;
      if (!o.eligibleRoles.includes(req.actor.role) || !withinScope(o.scope, p))
        fail(
          409,
          "INELIGIBLE",
          "Your current academic profile does not meet the required eligibility.",
        );
      if (
        o.mandatorySkills.length &&
        !(o.skillMode === "all"
          ? o.mandatorySkills.every((s) => p.skills.includes(s))
          : o.mandatorySkills.some((s) => p.skills.includes(s)))
      )
        fail(409, "INELIGIBLE", "A mandatory skill requirement is unmet.");
      if (!p.completion.matchingReady)
        fail(
          409,
          "PROFILE_INCOMPLETE",
          "Complete your verified career profile first.",
        );
      const cv = b.cvDocumentId
        ? await rpc("cv", `/internal/documents/${b.cvDocumentId}`, {
            actor: userToken(req),
          })
        : undefined;
      const profileSnapshot = {
        fullName: p.fullName,
        degreeProgramId: p.degreeProgramId,
        skills: p.skills,
        education: p.education,
        projects: p.projects,
        experience: p.experience,
        certifications: p.certifications,
        achievements: p.achievements,
        profileVersion: p.profileVersion,
      };
      respond(
        res,
        await ctx.command(
          req,
          async (session) => {
            const checked = await Opportunity.findOneAndUpdate(
              {
                _id: o._id,
                revision: o.revision,
                status: "published",
                ...(o.deadline ? { deadline: { $gt: new Date() } } : {}),
              },
              { $inc: { submissionSerial: 1 } },
              { new: true, session },
            );
            if (!checked)
              fail(
                409,
                "OPPORTUNITY_CHANGED",
                "The vacancy closed or changed before submission.",
              );
            const [v] = await Application.create(
              [
                {
                  opportunityId: String(o._id),
                  opportunityTitle: o.title,
                  organizationId: o.organizationId,
                  applicantId: req.actor.userId,
                  profileSnapshot,
                  cvSnapshot: cv,
                  status: "submitted",
                  consentAt: new Date(),
                  opportunityRevision: o.revision,
                  history: [
                    {
                      status: "submitted",
                      actorId: req.actor.userId,
                      at: new Date(),
                    },
                  ],
                },
              ],
              { session },
            );
            return v.toObject();
          },
          true,
        ),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/opportunities/:id/applications",
    auth(["employer"]),
    asyncRoute(async (req, res) => {
      const o = await Opportunity.findById(validate(id, req.params.id)).lean();
      if (
        !o ||
        o.publisherType !== "employer" ||
        o.applicationMethod !== "internal"
      )
        fail(404, "NOT_FOUND", "Internal vacancy not found.");
      await manage(req, o);
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Application.find({ ...filter, opportunityId: String(o._id) })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  async function updateApplication(req, withdraw = false) {
    const a = await Application.findById(validate(id, req.params.id)).lean();
    if (!a) fail(404, "NOT_FOUND", "Application not found.");
    const b = withdraw
      ? { status: "withdrawn" }
      : validate(
          z
            .object({
              status: z.enum(["shortlisted", "hired", "rejected"]),
              reason: text(1000, 3),
            })
            .strict(),
          req.body,
        );
    if (withdraw) {
      if (a.applicantId !== req.actor.userId)
        fail(403, "OWNERSHIP", "This application belongs to someone else.");
    } else {
      const o = await Opportunity.findById(a.opportunityId).lean();
      await manage(req, o);
    }
    checkTransition(a.status, b.status);
    return ctx.command(req, async (session) => {
      const v = await Application.findOneAndUpdate(
        { _id: a._id, status: a.status },
        {
          $set: { status: b.status },
          $push: {
            history: {
              status: b.status,
              actorId: req.actor.userId,
              reason: b.reason,
              at: new Date(),
            },
          },
        },
        { new: true, session },
      );
      if (!v)
        fail(409, "APPLICATION_CHANGED", "Reload the application status.");
      await ctx.emit(
        session,
        "notification",
        "ApplicationStatusChanged.v1",
        a._id,
        v.history.length,
        {
          userId: a.applicantId,
          title: `Application ${b.status}`,
          body: `Your application for ${a.opportunityTitle} is ${b.status}.`,
          resourceId: String(a._id),
        },
      );
      return v.toObject();
    });
  }
  app.patch(
    "/api/v1/applications/:id/status",
    auth(["employer"]),
    asyncRoute(async (req, res) => respond(res, await updateApplication(req))),
  );
  app.post(
    "/api/v1/applications/:id/withdraw",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) =>
      respond(res, await updateApplication(req, true)),
    ),
  );
  app.post(
    "/api/v1/academic-notices",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(noticeSchema, req.body);
      const scope = assertScope(req.actor, b.scope);
      await validateReferences({ ...b, scope });
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [n] = await Notice.create(
            [
              {
                ...b,
                scope,
                createdByUserId: req.actor.userId,
                publisherRole: req.actor.role,
              },
            ],
            { session },
          );
          return n.toObject();
        }),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/academic-notices",
    auth(["student", "alumni", "faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const managed = req.query.view === "managed";
      const find = {
        $and: [
          filter,
          managed
            ? { createdByUserId: req.actor.userId }
            : {
                status: "published",
                $or: [
                  { expiresAt: { $exists: false } },
                  { expiresAt: { $gt: new Date() } },
                ],
              },
        ],
      };
      if (managed && !["faculty", "admin"].includes(req.actor.role))
        fail(403, "ROLE", "Staff access is required.");
      const rows = await Notice.find(find)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const result = page(rows, limit);
      if (!managed && ["student", "alumni"].includes(req.actor.role)) {
        const p = await rpc("profile", "/internal/owner-snapshot", {
          actor: userToken(req),
        });
        result.items = result.items.filter(
          (n) => req.actor.role === "student" && withinScope(n.scope, p),
        );
      }
      respond(res, result);
    }),
  );
  app.get(
    "/api/v1/academic-notices/:id",
    auth(["student", "alumni", "faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const n = await Notice.findById(validate(id, req.params.id)).lean();
      if (!n) fail(404, "NOT_FOUND", "Notice not found.");
      await visible(req, n, true);
      res.set("ETag", `"${n.revision}"`);
      respond(res, n);
    }),
  );
  app.patch(
    "/api/v1/academic-notices/:id",
    auth(["faculty", "admin"]),
    asyncRoute(async (req, res) => {
      const n = await Notice.findById(validate(id, req.params.id)).lean();
      if (!n) fail(404, "NOT_FOUND", "Notice not found.");
      await manage(req, n, true);
      expectedRevision(req, n);
      const b = validate(noticeSchema, req.body);
      b.scope = assertScope(req.actor, b.scope);
      await validateReferences(b);
      respond(
        res,
        await ctx.command(req, async (session) => {
          const v = await Notice.findOneAndUpdate(
            { _id: n._id, revision: n.revision, status: { $ne: "archived" } },
            { $set: b, $unset: Object.fromEntries(["expiresAt","referenceUrl","relatedOpportunityId"].filter(key=>b[key]===undefined).map(key=>[key,1])), $inc: { revision: 1 } },
            { new: true, session },
          );
          if (!v) fail(412, "STALE_CONTENT", "Reload the notice.");
          await auditOverride(req, session, n, "notice.override_edit");
          for (const target of ["matching", "notification"])
            await ctx.emit(
              session,
              target,
              "AcademicNoticeUpdated.v1",
              n._id,
              v.revision,
              { contentId: String(n._id) },
            );
          return v.toObject();
        }),
      );
    }),
  );
  for (const action of ["publish", "archive"])
    app.post(
      `/api/v1/academic-notices/:id/${action}`,
      auth(["faculty", "admin"]),
      asyncRoute(async (req, res) => {
        const n = await Notice.findById(validate(id, req.params.id)).lean();
        if (!n) fail(404, "NOT_FOUND", "Notice not found.");
        await manage(req, n, true);
        respond(
          res,
          await ctx.command(
            req,
            async (session) => {
              const v = await Notice.findOneAndUpdate(
                {
                  _id: n._id,
                  revision: n.revision,
                  status: {
                    $in:
                      action === "publish" ? ["draft"] : ["draft", "published"],
                  },
                },
                {
                  $set: {
                    status: action === "publish" ? "published" : "archived",
                    [action === "publish" ? "publishedAt" : "archivedAt"]:
                      new Date(),
                  },
                  $inc: { revision: 1 },
                },
                { new: true, session },
              );
              if (!v)
                fail(
                  409,
                  "LIFECYCLE",
                  "The notice is no longer in the expected state.",
                );
              for (const target of ["matching", "notification"])
                await ctx.emit(
                  session,
                  target,
                  action === "publish"
                    ? "AcademicNoticePublished.v1"
                    : "AcademicNoticeArchived.v1",
                  n._id,
                  v.revision,
                  { contentId: String(n._id) },
                );
              await auditOverride(req, session, n, `notice.override_${action}`);
              return v.toObject();
            },
            true,
          ),
        );
      }),
    );
  app.get(
    "/internal/opportunities",
    internal(config, ["matching", "gateway"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Opportunity.find({
            $and: [
              filter,
              {
                status: "published",
                $or: [
                  { deadline: { $exists: false } },
                  { deadline: { $gt: new Date() } },
                ],
              },
            ],
          })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.get(
    "/internal/opportunities/:id",
    internal(config, ["matching"]),
    asyncRoute(async (req, res) => {
      const o = await Opportunity.findById(validate(id, req.params.id)).lean();
      if (!o) fail(404, "NOT_FOUND", "Opportunity not found.");
      if (userToken(req)) {
        req.actor = await ctx.actor(req);
        if (req.actor.role === "employer") await manage(req, o);
      }
      respond(res, o);
    }),
  );
  app.get(
    "/internal/content/:type/:id",
    internal(config, ["matching", "notification"]),
    asyncRoute(async (req, res) => {
      const collection =
        req.params.type === "academic_notice"
          ? Notice
          : req.params.type === "opportunity"
            ? Opportunity
            : null;
      if (!collection) fail(400, "CONTENT_TYPE", "Unsupported content type.");
      const c = await collection.findById(validate(id, req.params.id)).lean();
      if (!c) fail(404, "NOT_FOUND", "Content not found.");
      if (userToken(req)) {
        req.actor = await ctx.actor(req);
        if (req.actor.role === "faculty") assertScope(req.actor, c.scope);
      }
      respond(res, c);
    }),
  );
  app.get(
    "/internal/summary",
    internal(config, ["gateway"]),
    auth(),
    asyncRoute(async (req, res) => {
      let find = {};
      if (req.actor.role === "employer") {
        const o = await org(req);
        find = { organizationId: o._id };
      } else if (req.actor.role === "faculty")
        find = { createdByUserId: req.actor.userId };
      const stats = [
        {
          label: ["employer", "faculty"].includes(req.actor.role)
            ? "Your published opportunities"
            : "Published opportunities",
          value: await Opportunity.countDocuments({
            ...find,
            status: "published",
          }),
        },
      ];
      if (["student", "alumni"].includes(req.actor.role))
        stats.push({
          label: "Your applications",
          value: await Application.countDocuments({
            applicantId: req.actor.userId,
          }),
        });
      else if (req.actor.role === "employer")
        stats.push({
          label: "Received applications",
          value: await Application.countDocuments(find),
        });
      respond(res, { stats });
    }),
  );
  ctx.handlers.profile = { "OrganizationApprovalChanged.v1": async () => {} };
}

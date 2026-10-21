import {
  z,
  id,
  text,
  url,
  scopeSchema,
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
  profileSchema,
  checkVisibility,
  completion,
  careerSummary,
} from "./domain.js";

export async function install(ctx) {
  const { app, model, auth, config, rpc } = ctx;
  const Profile = model(
    "profiles",
    {
      userId: { type: String, unique: true, required: true },
      fullName: { type: String, default: "" },
      headline: String,
      bio: String,
      location: Object,
      professionalLinks: Array,
      profileVisibility: { type: String, default: "owner" },
      visibleCareerFields: { type: [String], default: [] },
      visibleProfileFields: { type: [String], default: [] },
      candidateDiscovery: { type: Object, default: () => ({ enabled: false }) },
      alumniDirectory: { type: Object, default: () => ({ enabled: false }) },
      mentoringOptIn: Boolean,
      consentUpdatedAt: Date,
      consentPolicyVersion: String,
      registrationNumber: String,
      facultyId: String,
      departmentId: String,
      degreeProgramId: String,
      batchId: String,
      academicYear: Number,
      academicStatus: { type: String, default: "current_student" },
      membershipApproved: { type: Boolean, default: false },
      skills: { type: [String], default: [] },
      careerInterests: [String],
      education: Array,
      projects: Array,
      experience: Array,
      certifications: Array,
      achievements: Array,
      graduationYear: Number,
      graduationStatus: String,
      graduationVerifiedAt: Date,
      graduationVerifiedBy: String,
      currentJobTitle: String,
      currentOrganization: String,
      employmentStatus: String,
      staffReference: String,
      designation: String,
      officeContactUrl: String,
      recruiterJobTitle: String,
      organizationDescription: String,
      profileVersion: { type: Number, default: 1 },
    },
    [
      [
        { registrationNumber: 1 },
        {
          unique: true,
          partialFilterExpression: {
            membershipApproved: true,
            registrationNumber: { $type: "string" },
          },
        },
      ],
      [{ "candidateDiscovery.enabled": 1, degreeProgramId: 1 }, {}],
      [{ skills: 1 }, {}],
    ],
  );
  const Taxonomy = model(
    "academic_taxonomies",
    {
      kind: String,
      label: String,
      parentId: String,
      active: { type: Boolean, default: true },
      yearCount: Number,
    },
    [[{ kind: 1, parentId: 1, label: 1 }, { unique: true }]],
  );
  const Membership = model(
    "membership_requests",
    {
      userId: String,
      fields: Object,
      status: { type: String, default: "submitted" },
      reason: String,
      reviewedBy: String,
      reviewedAt: Date,
    },
    [
      [
        { userId: 1 },
        { unique: true, partialFilterExpression: { status: "submitted" } },
      ],
    ],
  );
  const Graduation = model(
    "graduation_requests",
    {
      userId: String,
      degreeProgramId: String,
      batchId: String,
      claimedGraduationYear: Number,
      graduationYear: Number,
      status: { type: String, default: "submitted" },
      explanation: String,
      initiatedBy: String,
      reviewedBy: String,
      reviewedAt: Date,
      evidenceReference: String,
      reason: String,
      recommendations: Array,
    },
    [
      [
        { userId: 1 },
        {
          unique: true,
          partialFilterExpression: {
            status: {
              $in: ["submitted", "under_review", "role_change_pending"],
            },
          },
        },
      ],
    ],
  );
  const Organization = model("organizations", {
    primaryRecruiterUserId: { type: String, unique: true },
    organizationName: String,
    industry: String,
    website: String,
    organizationDescription: String,
    organizationApprovalStatus: { type: String, default: "pending" },
    reviewedBy: String,
    reviewedAt: Date,
    reason: String,
    evidenceReference: String,
    revision: { type: Number, default: 1 },
  });
  Object.assign(ctx, {
    Profile,
    Taxonomy,
    Membership,
    Graduation,
    Organization,
  });
  async function own(actor) {
    return Profile.findOneAndUpdate(
      { userId: actor.userId },
      { $setOnInsert: { userId: actor.userId } },
      { upsert: true, new: true },
    );
  }
  async function hierarchy(data, required = false) {
    const keys = ["facultyId", "departmentId", "degreeProgramId", "batchId"];
    const kinds = ["faculties", "departments", "degrees", "batches"];
    let parent;
    for (let i = 0; i < keys.length; i++) {
      if (!data[keys[i]]) {
        if (required)
          fail(400, "ACADEMIC_REQUIRED", "Complete the academic hierarchy.");
        continue;
      }
      const row = await Taxonomy.findOne({
        _id: data[keys[i]],
        kind: kinds[i],
        active: true,
      }).lean();
      if (!row || (i > 0 && String(row.parentId) !== String(parent)))
        fail(
          400,
          "ACADEMIC_HIERARCHY",
          "Select a valid faculty, department, degree and batch.",
        );
      parent = String(row._id);
      if (
        i === 2 &&
        data.academicYear &&
        data.academicYear > (row.yearCount || 4)
      )
        fail(400, "ACADEMIC_YEAR", "Select a year within the degree duration.");
    }
    if (
      data.skills?.length &&
      (await Taxonomy.countDocuments({
        _id: { $in: data.skills },
        kind: "skills",
        active: true,
      })) !== data.skills.length
    )
      fail(400, "SKILLS", "Select active skills from the registry.");
  }
  async function notifyProfile(session, p) {
    await ctx.emit(
      session,
      "matching",
      "ProfileMatchingChanged.v1",
      p.userId,
      p.profileVersion,
      { userId: p.userId },
    );
  }
  function checkGraduationYear(profile, year) {
    const starts = (profile?.education || [])
      .map((entry) => entry.startYear)
      .filter(Number.isInteger);
    if (starts.length && year < Math.min(...starts))
      fail(
        400,
        "GRADUATION_YEAR",
        "Graduation cannot precede the recorded education start year.",
      );
  }
  async function validateCriteria(scope, skillIds = [], degreeIds = []) {
    const keys = ["facultyId", "departmentId", "degreeProgramId", "batchId"];
    const kinds = ["faculties", "departments", "degrees", "batches"];
    for (let i = 0; i < keys.length; i++) {
      if (!scope[keys[i]]) continue;
      let reference = scope[keys[i]];
      for (let level = i; level >= 0; level--) {
        const row = await Taxonomy.findOne({
          _id: reference,
          kind: kinds[level],
          active: true,
        }).lean();
        if (
          !row ||
          (scope[keys[level]] && String(row._id) !== scope[keys[level]])
        )
          fail(
            400,
            "ACADEMIC_HIERARCHY",
            "Academic restrictions must belong to the same active hierarchy.",
          );
        if (
          level === 2 &&
          scope.academicYear &&
          scope.academicYear > (row.yearCount || 4)
        )
          fail(
            400,
            "ACADEMIC_YEAR",
            "The year exceeds this degree's duration.",
          );
        reference = row.parentId;
      }
    }
    for (const [kind, values] of [
      ["skills", skillIds],
      ["degrees", degreeIds],
    ]) {
      const unique = [...new Set(values)];
      if (
        unique.length &&
        (await Taxonomy.countDocuments({
          _id: { $in: unique },
          kind,
          active: true,
        })) !== unique.length
      )
        fail(
          400,
          "TAXONOMY",
          "Select active skills and degrees from the registry.",
        );
    }
  }
  async function approvedOrg(actor) {
    const org = await Organization.findOne({
      primaryRecruiterUserId: actor.userId,
      organizationApprovalStatus: "approved",
    }).lean();
    if (actor.role !== "employer" || !org)
      fail(
        403,
        "ORGANIZATION_APPROVAL",
        "An approved organization is required.",
      );
    return org;
  }
  ctx.approvedOrg = approvedOrg;
  async function statuses(rows) {
    return rpc("identity", "/internal/accounts/status", {
      method: "POST",
      body: { userIds: rows.map((p) => p.userId) },
    });
  }
  async function candidateRows(actor, query) {
    await approvedOrg(actor);
    if (query.role) validate(z.enum(["student", "alumni"]), query.role);
    const { filter, limit } = paginate(query, 50);
    const find = { "candidateDiscovery.enabled": true, ...filter };
    if (query.degreeProgramId)
      find.degreeProgramId = validate(id, query.degreeProgramId);
    const skillIds = query.skillIds
      ? validate(z.array(id).max(20), String(query.skillIds).split(","))
      : [];
    if (skillIds.length) {
      if (!["all", "any"].includes(query.skillMode))
        fail(400, "SKILL_MODE", "Choose all or any skills.");
      find.skills =
        query.skillMode === "all" ? { $all: skillIds } : { $in: skillIds };
    }
    if (query.careerInterest) {
      find.careerInterests = validate(text(100, 1), query.careerInterest);
      find.visibleCareerFields = { $all: ["careerInterests"] };
    }
    const rows = await Profile.find(find)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const accounts = await statuses(rows);
    const accountMap = new Map(accounts.map((a) => [a.userId, a]));
    const result = page(rows, limit);
    result.items = result.items.flatMap((p) => {
      const a = accountMap.get(p.userId);
      if (
        !a ||
        !["student", "alumni"].includes(a.role) ||
        (query.role && query.role !== a.role) ||
        !completion(p, a).candidateDiscoveryReady
      )
        return [];
      return [{ ...careerSummary(p, a), _id: p._id, createdAt: p.createdAt }];
    });
    return result;
  }
  app.get(
    "/api/v1/profiles/me",
    auth([], false),
    asyncRoute(async (req, res) =>
      respond(res, (await own(req.actor)).toObject()),
    ),
  );
  app.patch(
    "/api/v1/profiles/me",
    auth([], false),
    asyncRoute(async (req, res) => {
      const b = validate(profileSchema(req.actor.role), req.body);
      const p = await own(req.actor);
      const next = { ...p.toObject(), ...b };
      if (
        Number(String(req.headers["if-match"] || "").replaceAll('"', "")) !==
        p.profileVersion
      )
        fail(412, "STALE_PROFILE", "Reload the profile before saving.");
      checkVisibility(next, req.actor.role);
      await hierarchy(next);
      const academic = [
        "registrationNumber",
        "facultyId",
        "departmentId",
        "degreeProgramId",
        "batchId",
        "academicYear",
      ];
      if (
        p.membershipApproved &&
        academic.some(
          (k) => b[k] !== undefined && String(b[k]) !== String(p[k]),
        )
      )
        fail(
          409,
          "MEMBERSHIP_REVIEW",
          "Request review to change verified academic fields.",
        );
      const result = await ctx.command(req, async (session) => {
        const updated = await Profile.findOneAndUpdate(
          { _id: p._id, profileVersion: p.profileVersion },
          {
            $set: {
              ...b,
              ...(b.candidateDiscovery || b.alumniDirectory
                ? {
                    consentUpdatedAt: new Date(),
                    consentPolicyVersion: "2026-10-v1",
                  }
                : {}),
            },
            $inc: { profileVersion: 1 },
          },
          { new: true, session },
        );
        if (!updated)
          fail(412, "STALE_PROFILE", "Reload the profile before saving.");
        await notifyProfile(session, updated);
        return updated.toObject();
      });
      respond(res, result);
    }),
  );
  app.get(
    "/api/v1/profiles/me/completion",
    auth([], false),
    asyncRoute(async (req, res) =>
      respond(res, completion((await own(req.actor)).toObject(), req.actor)),
    ),
  );
  for (const kind of [
    "faculties",
    "departments",
    "degrees",
    "batches",
    "skills",
  ]) {
    app.get(
      `/api/v1/academic/${kind}`,
      auth([], false),
      asyncRoute(async (req, res) => {
        const find = { kind, active: true };
        if (req.query.parentId)
          find.parentId = validate(id, req.query.parentId);
        respond(
          res,
          await Taxonomy.find(find).sort({ label: 1 }).limit(200).lean(),
        );
      }),
    );
    app.post(
      `/api/v1/admin/academic/${kind}`,
      auth(["admin"]),
      asyncRoute(async (req, res) => {
        const b = validate(
          z
            .object({
              label: text(120, 2),
              parentId: id.optional(),
              yearCount: z.number().int().min(1).max(10).optional(),
              reason: text(1000, 3),
            })
            .strict(),
          req.body,
        );
        if (["departments", "degrees", "batches"].includes(kind)) {
          const parentKind = {
            departments: "faculties",
            degrees: "departments",
            batches: "degrees",
          }[kind];
          if (
            !(await Taxonomy.exists({
              _id: b.parentId,
              kind: parentKind,
              active: true,
            }))
          )
            fail(400, "PARENT", "Select an active parent record.");
        }
        const result = await ctx.command(req, async (session) => {
          const [row] = await Taxonomy.create(
            [
              {
                kind,
                label: b.label,
                parentId: b.parentId,
                yearCount: b.yearCount,
              },
            ],
            { session },
          );
          await ctx.audit(
            session,
            req.actor,
            "taxonomy.create",
            row._id,
            b.reason,
          );
          return row.toObject();
        });
        respond(res, result, 201);
      }),
    );
    app.patch(
      `/api/v1/admin/academic/${kind}/:id`,
      auth(["admin"]),
      asyncRoute(async (req, res) => {
        const b = validate(
          z
            .object({
              label: text(120, 2).optional(),
              active: z.boolean().optional(),
              reason: text(1000, 3),
            })
            .strict(),
          req.body,
        );
        respond(
          res,
          await ctx.command(req, async (session) => {
            const row = await Taxonomy.findOneAndUpdate(
              { _id: validate(id, req.params.id), kind },
              {
                $set: {
                  ...(b.label ? { label: b.label } : {}),
                  ...(b.active !== undefined ? { active: b.active } : {}),
                },
              },
              { new: true, session },
            );
            if (!row) fail(404, "NOT_FOUND", "Academic record not found.");
            await ctx.audit(
              session,
              req.actor,
              "taxonomy.update",
              row._id,
              b.reason,
            );
            return row.toObject();
          }),
        );
      }),
    );
  }
  app.post(
    "/api/v1/profiles/me/membership-requests",
    auth(["student", "alumni"], false),
    asyncRoute(async (req, res) => {
      const fields = validate(
        z
          .object({
            registrationNumber: text(50, 3),
            facultyId: id,
            departmentId: id,
            degreeProgramId: id,
            batchId: id,
            academicYear: z.number().int().min(1).max(10),
            graduationYear: z
              .number()
              .int()
              .min(1900)
              .max(new Date().getUTCFullYear())
              .optional(),
          })
          .strict(),
        req.body,
      );
      await hierarchy(fields, true);
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [v] = await Membership.create(
            [{ userId: req.actor.userId, fields }],
            { session },
          );
          return v.toObject();
        }),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/admin/membership-requests",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Membership.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.patch(
    "/api/v1/admin/membership-requests/:id/decision",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            decision: z.enum(["approved", "rejected"]),
            reason: text(1000, 3),
            evidenceReference: text(200, 3),
          })
          .strict(),
        req.body,
      );
      const request = await Membership.findById(
        validate(id, req.params.id),
      ).lean();
      if (!request || request.status !== "submitted")
        fail(409, "REQUEST_STATUS", "Request is unavailable for review.");
      await hierarchy(request.fields, true);
      const target = await rpc(
        "identity",
        `/internal/accounts/${request.userId}`,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          await Membership.updateOne(
            { _id: request._id, status: "submitted" },
            {
              $set: {
                status: b.decision,
                reviewedBy: req.actor.userId,
                reviewedAt: new Date(),
                reason: b.reason,
              },
            },
            { session },
          );
          if (b.decision === "approved") {
            const fields = { ...request.fields, membershipApproved: true };
            if (target.role === "alumni") {
              if (!fields.graduationYear)
                fail(
                  400,
                  "GRADUATION_YEAR",
                  "Confirm the alumni graduation year.",
                );
              fields.graduationStatus = "verified";
              checkGraduationYear(
                await Profile.findOne({ userId: request.userId }).session(
                  session,
                ),
                fields.graduationYear,
              );
              fields.academicStatus = "graduated";
              fields.graduationVerifiedAt = new Date();
              fields.graduationVerifiedBy = req.actor.userId;
            }
            const p = await Profile.findOneAndUpdate(
              { userId: request.userId },
              { $set: fields, $inc: { profileVersion: 1 } },
              { new: true, session },
            );
            await notifyProfile(session, p);
          }
          await ctx.audit(
            session,
            req.actor,
            "membership.review",
            request._id,
            b.reason,
          );
          return { status: b.decision };
        }),
      );
    }),
  );
  app.post(
    "/api/v1/organizations",
    auth(["employer"], false),
    asyncRoute(async (req, res) => {
      if (!req.actor.emailVerified)
        fail(403, "EMAIL_NOT_VERIFIED", "Verify your email first.");
      const b = validate(
        z
          .object({
            organizationName: text(200, 2),
            industry: text(100).optional(),
            website: url.optional(),
            organizationDescription: text(2000).optional(),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [org] = await Organization.create(
            [{ ...b, primaryRecruiterUserId: req.actor.userId }],
            { session },
          );
          return org.toObject();
        }),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/organizations/me",
    auth(["employer"], false),
    asyncRoute(async (req, res) =>
      respond(
        res,
        await Organization.findOne({
          primaryRecruiterUserId: req.actor.userId,
        }).lean(),
      ),
    ),
  );
  app.patch(
    "/api/v1/organizations/me",
    auth(["employer"], false),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            organizationName: text(200, 2).optional(),
            industry: text(100).optional(),
            website: url.optional(),
            organizationDescription: text(2000).optional(),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const o = await Organization.findOne({
            primaryRecruiterUserId: req.actor.userId,
          }).session(session);
          if (!o) fail(404, "NOT_FOUND", "Create your organization first.");
          if (b.organizationName && b.organizationName !== o.organizationName)
            o.organizationApprovalStatus = "pending";
          Object.assign(o, b);
          o.revision++;
          await o.save({ session });
          await ctx.emit(
            session,
            "opportunity",
            "OrganizationApprovalChanged.v1",
            o._id,
            o.revision,
            { organizationId: String(o._id) },
          );
          return o.toObject();
        }),
      );
    }),
  );
  app.get(
    "/api/v1/admin/organizations",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Organization.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.patch(
    "/api/v1/admin/organizations/:id/approval",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            status: z.enum(["approved", "rejected", "suspended"]),
            reason: text(1000, 3),
            evidenceReference: text(200, 3),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const o = await Organization.findById(
            validate(id, req.params.id),
          ).session(session);
          if (!o) fail(404, "NOT_FOUND", "Organization not found.");
          o.organizationApprovalStatus = b.status;
          o.reason = b.reason;
          o.evidenceReference = b.evidenceReference;
          o.reviewedBy = req.actor.userId;
          o.reviewedAt = new Date();
          o.revision++;
          await o.save({ session });
          await ctx.audit(
            session,
            req.actor,
            "organization.review",
            o._id,
            b.reason,
          );
          await ctx.emit(
            session,
            "opportunity",
            "OrganizationApprovalChanged.v1",
            o._id,
            o.revision,
            { organizationId: String(o._id) },
          );
          return o.toObject();
        }),
      );
    }),
  );
  async function graduationRequest(req, admin = false) {
    const b = validate(
      z
        .object({
          ...(admin ? { userId: id, reason: text(1000, 3) } : {}),
          degreeProgramId: id,
          batchId: id,
          claimedGraduationYear: z
            .number()
            .int()
            .min(1900)
            .max(new Date().getUTCFullYear()),
          explanation: text(1000).optional(),
        })
        .strict(),
      req.body,
    );
    const userId = admin ? b.userId : req.actor.userId;
    const p = await Profile.findOne({ userId });
    const a = admin
      ? await rpc("identity", `/internal/accounts/${userId}`)
      : req.actor;
    if (
      a.role !== "student" ||
      !p?.membershipApproved ||
      p.degreeProgramId !== b.degreeProgramId ||
      p.batchId !== b.batchId
    )
      fail(
        409,
        "GRADUATION_MEMBERSHIP",
        "The request must reference the verified student degree/cohort.",
      );
    return ctx.command(
      req,
      async (session) => {
        const [v] = await Graduation.create(
          [
            {
              userId,
              degreeProgramId: b.degreeProgramId,
              batchId: b.batchId,
              claimedGraduationYear: b.claimedGraduationYear,
              explanation: b.explanation,
              initiatedBy: req.actor.userId,
            },
          ],
          { session },
        );
        await Profile.updateOne(
          { userId },
          {
            $set: { academicStatus: "graduation_pending" },
            $inc: { profileVersion: 1 },
          },
          { session },
        );
        return v.toObject();
      },
      true,
    );
  }
  app.post(
    "/api/v1/profiles/me/graduation-requests",
    auth(["student"]),
    asyncRoute(async (req, res) =>
      respond(res, await graduationRequest(req), 201),
    ),
  );
  app.get(
    "/api/v1/profiles/me/graduation-requests",
    auth(["student", "alumni"], false),
    asyncRoute(async (req, res) =>
      respond(
        res,
        await Graduation.find({ userId: req.actor.userId })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
      ),
    ),
  );
  app.post(
    "/api/v1/admin/graduation-requests",
    auth(["admin"]),
    asyncRoute(async (req, res) =>
      respond(res, await graduationRequest(req, true), 201),
    ),
  );
  for (const role of ["admin", "faculty"])
    app.get(
      `/api/v1/${role}/graduation-requests`,
      auth([role]),
      asyncRoute(async (req, res) => {
        const { filter, limit } = paginate(req.query);
        let userIds;
        if (role === "faculty") {
          const scope = assertScope(req.actor, {});
          userIds = (await Profile.find(scope).select("userId").lean()).map(
            (p) => p.userId,
          );
        }
        const rows = await Graduation.find({
          ...filter,
          ...(userIds ? { userId: { $in: userIds } } : {}),
        })
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit + 1)
          .lean();
        const profiles = await Profile.find({
          userId: { $in: rows.map((row) => row.userId) },
        })
          .select("userId fullName registrationNumber")
          .lean();
        const display = new Map(
          profiles.map((profile) => [profile.userId, profile]),
        );
        respond(
          res,
          page(
            rows.map((row) => ({
              ...row,
              fullName: display.get(row.userId)?.fullName,
              registrationNumber: display.get(row.userId)?.registrationNumber,
            })),
            limit,
          ),
        );
      }),
    );
  app.post(
    "/api/v1/faculty/graduation-requests/:id/recommendations",
    auth(["faculty"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            recommendation: z.enum(["recommend", "request_review"]),
            evidenceReference: text(200, 3),
            reason: text(1000, 3),
          })
          .strict(),
        req.body,
      );
      const g = await Graduation.findById(validate(id, req.params.id)).lean();
      const p = g && (await Profile.findOne({ userId: g.userId }).lean());
      if (!p || !withinScope(assertScope(req.actor, {}), p))
        fail(403, "SCOPE", "Request is outside your assigned scope.");
      respond(
        res,
        await ctx.command(req, async (session) => {
          await Graduation.updateOne(
            { _id: g._id, status: { $in: ["submitted", "under_review"] } },
            {
              $push: {
                recommendations: {
                  ...b,
                  actorId: req.actor.userId,
                  createdAt: new Date(),
                },
              },
            },
            { session },
          );
          await ctx.audit(
            session,
            req.actor,
            "graduation.recommend",
            g._id,
            b.reason,
          );
          return { recorded: true };
        }),
        201,
      );
    }),
  );
  app.patch(
    "/api/v1/admin/graduation-requests/:id/decision",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            decision: z.enum(["approved", "rejected"]),
            graduationYear: z
              .number()
              .int()
              .min(1900)
              .max(new Date().getUTCFullYear())
              .optional(),
            evidenceReference: text(200, 3),
            reason: text(1000, 3),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const g = await Graduation.findOne({
            _id: validate(id, req.params.id),
            status: { $in: ["submitted", "under_review"] },
          }).session(session);
          if (!g) fail(409, "GRADUATION_STATUS", "Request is no longer open.");
          g.status =
            b.decision === "approved" ? "role_change_pending" : "rejected";
          g.reviewedBy = req.actor.userId;
          g.reviewedAt = new Date();
          g.evidenceReference = b.evidenceReference;
          g.reason = b.reason;
          if (b.decision === "approved") {
            if (!b.graduationYear)
              fail(
                400,
                "GRADUATION_YEAR",
                "Confirm the institutional graduation year.",
              );
            g.graduationYear = b.graduationYear;
            const profile = await Profile.findOne({ userId: g.userId }).session(
              session,
            );
            if (
              !profile?.membershipApproved ||
              profile.degreeProgramId !== g.degreeProgramId ||
              profile.batchId !== g.batchId
            )
              fail(
                409,
                "GRADUATION_MEMBERSHIP",
                "Membership changed. Review a new graduation request.",
              );
            checkGraduationYear(profile, b.graduationYear);
            await Profile.updateOne(
              { userId: g.userId },
              {
                $set: {
                  graduationYear: b.graduationYear,
                  graduationStatus: "verified",
                  graduationVerifiedAt: new Date(),
                  graduationVerifiedBy: req.actor.userId,
                },
                $inc: { profileVersion: 1 },
              },
              { session },
            );
            await ctx.emit(
              session,
              "identity",
              "GraduationVerified.v1",
              g.userId,
              1,
              { userId: g.userId, requestId: String(g._id) },
            );
          } else
            await Profile.updateOne(
              { userId: g.userId },
              {
                $set: { academicStatus: "current_student" },
                $inc: { profileVersion: 1 },
              },
              { session },
            );
          await g.save({ session });
          await ctx.audit(
            session,
            req.actor,
            "graduation.review",
            g._id,
            b.reason,
          );
          return g.toObject();
        }),
      );
    }),
  );
  app.get(
    "/api/v1/candidates/search",
    auth(["employer"]),
    asyncRoute(async (req, res) =>
      respond(res, await candidateRows(req.actor, req.query)),
    ),
  );
  async function candidate(actor, userId) {
    await approvedOrg(actor);
    const p = await Profile.findOne({ userId: validate(id, userId) }).lean();
    if (!p) fail(404, "CANDIDATE_UNAVAILABLE", "Candidate is unavailable.");
    const a = await rpc("identity", `/internal/accounts/${userId}`);
    if (!completion(p, a).candidateDiscoveryReady)
      fail(404, "CANDIDATE_UNAVAILABLE", "Candidate is unavailable.");
    return careerSummary(p, a);
  }
  app.get(
    "/api/v1/candidates/:id",
    auth(["employer"]),
    asyncRoute(async (req, res) =>
      respond(res, await candidate(req.actor, req.params.id)),
    ),
  );
  app.get(
    "/api/v1/alumni",
    auth(),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const rows = await Profile.find({
        ...filter,
        "alumniDirectory.enabled": true,
        profileVisibility: "university",
        graduationStatus: "verified",
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const accounts = await statuses(rows);
      const map = new Map(accounts.map((a) => [a.userId, a]));
      const result = page(rows, limit);
      result.items = result.items.flatMap((p) => {
        const a = map.get(p.userId);
        return a?.role === "alumni" &&
          a.isActive &&
          a.emailVerified &&
          a.approvalStatus === "approved"
          ? [careerSummary(p, a, true)]
          : [];
      });
      if (req.actor.role === "employer")
        fail(403, "DIRECTORY", "Use consent-based candidate search.");
      respond(res, result);
    }),
  );
  app.get(
    "/api/v1/profiles/:id",
    auth(),
    asyncRoute(async (req, res) => {
      if (req.actor.role === "employer") {
        respond(res, await candidate(req.actor, req.params.id));
        return;
      }
      const p = await Profile.findOne({
        userId: validate(id, req.params.id),
      }).lean();
      if (!p || p.profileVisibility !== "university")
        fail(404, "NOT_FOUND", "Profile is unavailable.");
      const a = await rpc("identity", `/internal/accounts/${p.userId}`);
      if (!a.isActive || a.approvalStatus !== "approved")
        fail(404, "NOT_FOUND", "Profile is unavailable.");
      respond(res, careerSummary(p, a, true));
    }),
  );
  app.get(
    "/internal/verification-summary/:id",
    internal(config, ["identity"]),
    asyncRoute(async (req, res) => {
      const p = await Profile.findOne({
        userId: validate(id, req.params.id),
      }).lean();
      const a = await rpc("identity", `/internal/accounts/${req.params.id}`);
      const org =
        a.role === "employer" &&
        (await Organization.findOne({
          primaryRecruiterUserId: a.userId,
          organizationApprovalStatus: "approved",
        }));
      respond(res, {
        ready: !!(
          p?.fullName &&
          (["student", "alumni"].includes(a.role)
            ? p.membershipApproved &&
              (a.role !== "alumni" || p.graduationStatus === "verified")
            : a.role === "employer"
              ? org
              : p.staffReference && p.designation)
        ),
      });
    }),
  );
  app.get(
    "/internal/organizations/me",
    internal(config, ["opportunity", "matching", "gateway"]),
    auth(["employer"]),
    asyncRoute(async (req, res) => respond(res, await approvedOrg(req.actor))),
  );
  async function organizationStatus(organizationId) {
    const o = await Organization.findById(validate(id, organizationId)).lean();
    if (!o) fail(404, "NOT_FOUND", "Organization not found.");
    const a = await rpc(
      "identity",
      `/internal/accounts/${o.primaryRecruiterUserId}`,
    );
    if (
      o.organizationApprovalStatus !== "approved" ||
      !a.isActive ||
      !a.emailVerified ||
      a.approvalStatus !== "approved"
    )
      fail(
        403,
        "ORGANIZATION_APPROVAL",
        "This organization is not currently approved.",
      );
    return { o, a };
  }
  app.get(
    "/internal/organizations/:id/status",
    internal(config, ["opportunity", "matching"]),
    asyncRoute(async (req, res) => {
      const { o } = await organizationStatus(req.params.id);
      respond(res, { organizationId: String(o._id), approved: true });
    }),
  );
  app.get(
    "/internal/recommendation-candidates",
    internal(config, ["matching"]),
    asyncRoute(async (req, res) => {
      const { a } = await organizationStatus(req.query.organizationId);
      respond(res, await candidateRows(a, req.query));
    }),
  );
  app.get(
    "/internal/owner-snapshot",
    internal(config, ["opportunity", "matching", "cv", "community", "gateway"]),
    auth(),
    asyncRoute(async (req, res) => {
      const p = (await own(req.actor)).toObject();
      respond(res, {
        ...p,
        role: req.actor.role,
        completion: completion(p, req.actor),
      });
    }),
  );
  app.get(
    "/internal/candidates",
    internal(config, ["matching"]),
    auth(["employer"]),
    asyncRoute(async (req, res) =>
      respond(res, await candidateRows(req.actor, req.query)),
    ),
  );
  app.get(
    "/internal/candidates/:id",
    internal(config, ["matching"]),
    auth(["employer"]),
    asyncRoute(async (req, res) =>
      respond(res, await candidate(req.actor, req.params.id)),
    ),
  );
  app.get(
    "/internal/academic-labels",
    internal(config, ["matching", "cv", "opportunity", "gateway"]),
    asyncRoute(async (req, res) =>
      respond(res, await Taxonomy.find({ active: true }).limit(1000).lean()),
    ),
  );
  app.post(
    "/internal/validate-taxonomy",
    internal(config, ["identity", "opportunity", "matching"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            scope: scopeSchema,
            skillIds: z.array(id).max(100).default([]),
            degreeIds: z.array(id).max(30).default([]),
          })
          .strict(),
        req.body,
      );
      await validateCriteria(b.scope, b.skillIds, b.degreeIds);
      respond(res, { valid: true });
    }),
  );
  app.post(
    "/internal/recipient-eligibility",
    internal(config, ["matching", "notification"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z.object({ userId: id, criteria: scopeSchema }).strict(),
        req.body,
      );
      const p = await Profile.findOne({ userId: b.userId }).lean();
      const a = await rpc("identity", `/internal/accounts/${b.userId}`);
      respond(res, {
        eligible: !!(
          p?.membershipApproved &&
          withinScope(b.criteria, p) &&
          a.isActive &&
          a.emailVerified &&
          a.approvalStatus === "approved" &&
          a.role === "student"
        ),
      });
    }),
  );
  app.post(
    "/internal/recipients",
    internal(config, ["matching", "opportunity"]),
    auth(["faculty", "admin", "student", "alumni"]),
    asyncRoute(async (req, res) => {
      const criteria = validate(scopeSchema, req.body.criteria || {});
      await validateCriteria(criteria);
      let scope = criteria;
      if (req.actor.role === "faculty")
        scope = assertScope(req.actor, criteria);
      else if (["student", "alumni"].includes(req.actor.role)) {
        const p = await own(req.actor);
        respond(
          res,
          withinScope(criteria, p)
            ? [{ userId: req.actor.userId, profileVersion: p.profileVersion }]
            : [],
        );
        return;
      }
      const offset = Number(req.body.offset || 0);
      if (!Number.isInteger(offset) || offset < 0)
        fail(400, "OFFSET", "Invalid recipient page.");
      const rows = await Profile.find(scope)
        .sort({ _id: 1 })
        .skip(offset)
        .limit(200)
        .lean();
      const accounts = await statuses(rows);
      const byId = new Map(accounts.map((a) => [a.userId, a]));
      respond(res, {
        items: rows.flatMap((p) => {
          const a = byId.get(p.userId);
          return a &&
            a.isActive &&
            a.emailVerified &&
            a.approvalStatus === "approved" &&
            a.role === "student" &&
            p.membershipApproved
            ? [{ userId: p.userId, profileVersion: p.profileVersion }]
            : [];
        }),
        nextOffset: rows.length === 200 ? offset + 200 : null,
      });
    }),
  );
  app.get(
    "/internal/author/:id",
    internal(config, ["community"]),
    asyncRoute(async (req, res) => {
      const p = await Profile.findOne({
        userId: validate(id, req.params.id),
      }).lean();
      respond(res, {
        userId: req.params.id,
        fullName: p?.fullName || "University member",
      });
    }),
  );
  app.get(
    "/internal/summary",
    internal(config, ["gateway"]),
    auth(),
    asyncRoute(async (req, res) => {
      if (req.actor.role === "faculty") {
        const count = await Profile.countDocuments({
          ...assertScope(req.actor, {}),
          membershipApproved: true,
        });
        respond(res, {
          stats: [
            {
              label: "Approved profiles in scope",
              value: count < 5 ? null : count,
              suppressed: count < 5,
            },
          ],
        });
      } else if (req.actor.role === "admin")
        respond(res, {
          stats: [
            { label: "Profiles", value: await Profile.countDocuments() },
            {
              label: "Membership reviews pending",
              value: await Membership.countDocuments({ status: "submitted" }),
            },
            {
              label: "Organizations pending review",
              value: await Organization.countDocuments({
                organizationApprovalStatus: "pending",
              }),
            },
          ],
        });
      else {
        const p = (await own(req.actor)).toObject();
        respond(res, {
          stats: [{ label: "Saved profile version", value: p.profileVersion }],
        });
      }
    }),
  );
  ctx.handlers.identity = {
    "AccountRegistered.v1": async (e, session) => {
      await Profile.updateOne(
        { userId: e.data.userId },
        { $setOnInsert: { userId: e.data.userId } },
        { upsert: true, session },
      );
      await Profile.updateOne(
        { userId: e.data.userId, fullName: "" },
        { $set: { fullName: e.data.fullName } },
        { session },
      );
    },
    "GraduationRoleChanged.v1": async (e, session) => {
      await Graduation.updateOne(
        { _id: e.data.requestId, userId: e.data.userId },
        { $set: { status: "completed" } },
        { session },
      );
      await Profile.updateOne(
        { userId: e.data.userId },
        {
          $set: { academicStatus: "graduated" },
          $pull: { visibleCareerFields: "academicYear" },
          $inc: { profileVersion: 1 },
        },
        { session },
      );
    },
    "AccountDeletionRequested.v1": async (e, session) => {
      await Profile.updateOne(
        { userId: e.data.userId },
        {
          $set: {
            "candidateDiscovery.enabled": false,
            "alumniDirectory.enabled": false,
            profileVisibility: "owner",
          },
          $inc: { profileVersion: 1 },
        },
        { session },
      );
    },
  };
}

import express from "express";
import crypto from "node:crypto";
import {
  z,
  id,
  text,
  validate,
  fail,
  respond,
  asyncRoute,
  userToken,
  paginate,
  page,
} from "@nexvia/platform-utils";
import {
  postApplicationSchema,
  referralTransitions,
  acceptsApplications,
} from "./domain.js";

export async function installPostApplications(ctx) {
  const { app, model, auth, rpc, Post } = ctx;
  const Owner = model("post_owner_states", {
    ownerId: { type: String, unique: true },
    deletedAt: Date,
    serial: { type: Number, default: 0 },
  });
  const serializeOwner = async (ownerId, session) => {
    await Owner.updateOne(
      { ownerId },
      { $setOnInsert: { ownerId } },
      { upsert: true, session },
    );
    const active = await Owner.findOneAndUpdate(
      { ownerId, deletedAt: { $exists: false } },
      {
        $inc: { serial: 1 },
      },
      { new: true, session },
    );
    if (!active)
      fail(401, "ACCOUNT_DELETED", "This account can no longer submit a CV.");
  };
  const File = model(
    "post_cv_files",
    {
      ownerId: String,
      filename: String,
      data: Buffer,
      size: Number,
      sha256: String,
      uploadKey: { type: String, unique: true },
      pendingSlot: String,
      expiresAt: Date,
      applicationId: String,
    },
    [
      [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
      [
        { pendingSlot: 1 },
        {
          unique: true,
          partialFilterExpression: { pendingSlot: { $type: "string" } },
        },
      ],
    ],
  );
  const Application = model(
    "post_applications",
    {
      postId: String,
      postRevision: Number,
      postTitle: String,
      company: String,
      recipientId: String,
      applicantId: String,
      applicantName: String,
      profileSnapshot: Object,
      contactEmail: String,
      message: String,
      cvFileId: String,
      cvFilename: String,
      cvSize: Number,
      cvAvailable: { type: Boolean, default: true },
      consentAt: Date,
      consentPolicyVersion: String,
      status: { type: String, default: "submitted" },
      revision: { type: Number, default: 1 },
      history: [Object],
    },
    [
      [{ postId: 1, applicantId: 1 }, { unique: true }],
      [{ recipientId: 1, createdAt: -1, _id: -1 }, {}],
      [{ applicantId: 1, createdAt: -1, _id: -1 }, {}],
    ],
  );
  Object.assign(ctx, {
    PostApplication: Application,
    PostCvFile: File,
    PostOwnerState: Owner,
  });

  const dto = (a, actor) => {
    const { cvFileId, ...result } = a;
    if (a.status === "withdrawn" && actor !== a.applicantId) {
      delete result.contactEmail;
      delete result.message;
      delete result.profileSnapshot;
      result.cvAvailable = false;
    }
    return result;
  };
  const owned = async (req) => {
    const a = await Application.findOne({
      _id: validate(id, req.params.id),
      $or: [
        { applicantId: req.actor.userId },
        { recipientId: req.actor.userId },
      ],
    }).lean();
    if (!a) fail(404, "NOT_FOUND", "Application not found.");
    return a;
  };
  const emitStatus = (session, a) =>
    ctx.emit(
      session,
      "notification",
      "PostApplicationStatusChanged.v1",
      a._id,
      a.revision,
      {
        userId: a.applicantId,
        title: "Job referral application updated",
        body: `Your application for ${a.postTitle} is ${a.status}.`,
        resourceType: "post_application",
        resourceId: String(a._id),
      },
    );

  app.post(
    "/api/v1/post-cv-uploads",
    auth(["student", "alumni"]),
    express.raw({ type: "application/pdf", limit: "2mb" }),
    asyncRoute(async (req, res) => {
      const bytes = req.body;
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length < 20 ||
        !/^%PDF-(1\.\d|2\.0)/.test(bytes.subarray(0, 12).toString("ascii")) ||
        !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
      )
        fail(400, "CV_FILE", "Upload a valid PDF CV, no larger than 2 MB.");
      let filename;
      try {
        filename = decodeURIComponent(
          String(req.headers["x-cv-filename"] || "CV.pdf"),
        );
      } catch {
        fail(400, "CV_FILENAME", "The CV filename is invalid.");
      }
      filename = validate(text(160, 5), filename);
      if (!/\.pdf$/i.test(filename) || /[\\/\r\n]/.test(filename))
        fail(400, "CV_FILENAME", "Use a PDF filename without folder paths.");
      const key = validate(
        z.string().regex(/^[\w-]{8,128}$/),
        req.headers["idempotency-key"],
      );
      const uploadKey = `${req.actor.userId}:${key}`;
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      const result = (f) => ({
        uploadId: String(f._id),
        filename: f.filename,
        size: f.size,
      });
      const old = await File.findOne({ uploadKey }).select("-data").lean();
      if (old) {
        if (old.sha256 !== sha256 || old.filename !== filename)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This upload key was used for another file.",
          );
        return respond(res, result(old), 201);
      }
      await File.deleteMany({
        ownerId: req.actor.userId,
        expiresAt: { $lt: new Date() },
      });
      for (let slot = 0; slot < 5; slot++) {
        try {
          let f;
          await ctx.transaction(async (session) => {
            await serializeOwner(req.actor.userId, session);
            [f] = await File.create(
              [
                {
                  ownerId: req.actor.userId,
                  filename,
                  data: bytes,
                  size: bytes.length,
                  sha256,
                  uploadKey,
                  pendingSlot: `${req.actor.userId}:${slot}`,
                  expiresAt: new Date(Date.now() + 3600000),
                },
              ],
              { session },
            );
          });
          return respond(res, result(f), 201);
        } catch (error) {
          if (error.code !== 11000) throw error;
          const duplicate = await File.findOne({ uploadKey })
            .select("-data")
            .lean();
          if (duplicate) {
            if (duplicate.sha256 !== sha256 || duplicate.filename !== filename)
              fail(
                409,
                "IDEMPOTENCY_CONFLICT",
                "This upload key was used for another file.",
              );
            return respond(res, result(duplicate), 201);
          }
        }
      }
      fail(
        429,
        "UPLOAD_LIMIT",
        "You have five unused uploads. Submit an application or wait one hour before uploading again.",
      );
    }),
  );

  app.post(
    "/api/v1/posts/:id/applications",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const b = validate(postApplicationSchema, req.body);
      const p = await Post.findById(validate(id, req.params.id)).lean();
      if (!p || !acceptsApplications(p))
        fail(
          409,
          "POST_CLOSED",
          "This job referral is no longer accepting applications.",
        );
      if (p.authorId === req.actor.userId)
        fail(409, "OWN_POST", "You cannot apply to your own post.");
      if (p.revision !== b.postRevision)
        fail(
          412,
          "STALE_POST",
          "Refresh and review the updated job post before applying.",
        );
      const recipient = await rpc(
        "identity",
        `/internal/accounts/${p.authorId}`,
      );
      if (
        !recipient.isActive ||
        !recipient.emailVerified ||
        recipient.approvalStatus !== "approved"
      )
        fail(
          409,
          "AUTHOR_UNAVAILABLE",
          "The post author cannot receive applications right now.",
        );
      const profile = await rpc("profile", "/internal/owner-snapshot", {
        actor: userToken(req),
      });
      if (!profile.fullName || profile.fullName.length < 2)
        fail(
          409,
          "PROFILE_INCOMPLETE",
          "Add your full name to your profile before applying.",
        );
      respond(
        res,
        await ctx.command(
          req,
          async (session) => {
            await serializeOwner(req.actor.userId, session);
            // Serialize new applications with editing, closure, deletion and moderation.
            const current = await Post.findOneAndUpdate(
              {
                _id: p._id,
                revision: b.postRevision,
                status: "published",
                jobStatus: "open",
                ...(p.job.deadline
                  ? { "job.deadline": { $gt: new Date() } }
                  : {}),
              },
              { $inc: { submissionSerial: 1 } },
              { new: true, session },
            );
            if (!current)
              fail(
                409,
                "POST_CHANGED",
                "The job post changed or closed before submission.",
              );
            const existing = await Application.exists({
              postId: String(p._id),
              applicantId: req.actor.userId,
            }).session(session);
            if (existing)
              fail(
                409,
                "ALREADY_APPLIED",
                "You already applied to this job referral.",
              );
            const file = await File.findOne({
              _id: b.cvUploadId,
              ownerId: req.actor.userId,
              applicationId: { $exists: false },
              expiresAt: { $gt: new Date() },
            })
              .select("-data")
              .session(session)
              .lean();
            if (!file)
              fail(
                409,
                "CV_UPLOAD",
                "Upload your PDF CV again before submitting.",
              );
            const [a] = await Application.create(
              [
                {
                  postId: String(p._id),
                  postRevision: p.revision,
                  postTitle: p.job.title,
                  company: p.job.company,
                  recipientId: p.authorId,
                  applicantId: req.actor.userId,
                  applicantName: profile.fullName,
                  profileSnapshot: {
                    fullName: profile.fullName,
                    profileVersion: profile.profileVersion,
                  },
                  contactEmail: b.contactEmail,
                  message: b.message,
                  cvFileId: String(file._id),
                  cvFilename: file.filename,
                  cvSize: file.size,
                  consentAt: new Date(),
                  consentPolicyVersion: "post-referral-2026-10-v1",
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
            const bound = await File.updateOne(
              { _id: file._id, applicationId: { $exists: false } },
              {
                $set: { applicationId: String(a._id) },
                $unset: { expiresAt: 1, pendingSlot: 1 },
              },
              { session },
            );
            if (!bound.modifiedCount)
              fail(
                409,
                "CV_UPLOAD",
                "This PDF was already used. Upload it again for this application.",
              );
            await ctx.emit(
              session,
              "notification",
              "PostApplicationSubmitted.v1",
              a._id,
              1,
              {
                userId: p.authorId,
                title: "New job referral application",
                body: `${profile.fullName} applied for ${p.job.title}.`,
                resourceType: "received_post_application",
                resourceId: String(a._id),
              },
            );
            return dto(a.toObject(), req.actor.userId);
          },
          true,
        ),
        201,
      );
    }),
  );

  app.get(
    "/api/v1/post-applications",
    auth(),
    asyncRoute(async (req, res) => {
      const view = validate(
        z.enum(["sent", "received"]).default("sent"),
        req.query.view,
      );
      const { filter, limit } = paginate(req.query);
      const rows = await Application.find({
        ...filter,
        [view === "received" ? "recipientId" : "applicantId"]: req.actor.userId,
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const result = page(rows, limit);
      respond(res, {
        ...result,
        items: result.items.map((a) => dto(a, req.actor.userId)),
      });
    }),
  );
  app.get(
    "/api/v1/post-applications/:id/cv",
    auth(),
    asyncRoute(async (req, res) => {
      const a = await owned(req);
      if (a.status === "withdrawn" && req.actor.userId !== a.applicantId)
        fail(
          403,
          "APPLICATION_WITHDRAWN",
          "The applicant withdrew access to this CV.",
        );
      const file = await File.findOne({
        _id: a.cvFileId,
        applicationId: String(a._id),
      }).lean();
      if (!file) fail(410, "CV_UNAVAILABLE", "This CV is no longer available.");
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="CV.pdf"',
      });
      res.send(
        Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer),
      );
    }),
  );
  app.patch(
    "/api/v1/post-applications/:id/status",
    auth(),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            status: z.enum(["reviewing", "forwarded", "declined"]),
            reason: text(1000, 3),
          })
          .strict(),
        req.body,
      );
      const a = await owned(req);
      if (a.recipientId !== req.actor.userId)
        fail(
          403,
          "APPLICATION_OWNER",
          "Only the post author can review this application.",
        );
      if (!referralTransitions[a.status]?.includes(b.status))
        fail(
          409,
          "APPLICATION_TRANSITION",
          "This application can no longer move to that status.",
        );
      const expected = Number(
        String(req.headers["if-match"]).replaceAll('"', ""),
      );
      if (a.revision !== expected)
        fail(
          412,
          "STALE_APPLICATION",
          "Reload the current application before reviewing.",
        );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const updated = await Application.findOneAndUpdate(
            { _id: a._id, revision: expected, status: a.status },
            {
              $set: { status: b.status },
              $inc: { revision: 1 },
              $push: {
                history: {
                  status: b.status,
                  reason: b.reason,
                  actorId: req.actor.userId,
                  at: new Date(),
                },
              },
            },
            { session, new: true },
          );
          if (!updated)
            fail(
              412,
              "STALE_APPLICATION",
              "The applicant or another reviewer changed this application.",
            );
          await emitStatus(session, updated);
          await ctx.audit(
            session,
            req.actor,
            "post-application.review",
            updated._id,
            b.reason,
          );
          return dto(updated.toObject(), req.actor.userId);
        }),
      );
    }),
  );
  app.post(
    "/api/v1/post-applications/:id/withdraw",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const a = await owned(req);
      if (a.applicantId !== req.actor.userId)
        fail(403, "APPLICATION_OWNER", "Only the applicant can withdraw.");
      respond(
        res,
        await ctx.command(req, async (session) => {
          const updated = await Application.findOneAndUpdate(
            {
              _id: a._id,
              applicantId: req.actor.userId,
              status: { $in: ["submitted", "reviewing", "forwarded"] },
            },
            {
              $set: { status: "withdrawn" },
              $inc: { revision: 1 },
              $push: {
                history: {
                  status: "withdrawn",
                  actorId: req.actor.userId,
                  at: new Date(),
                },
              },
            },
            { new: true, session },
          );
          if (!updated)
            fail(
              409,
              "APPLICATION_TRANSITION",
              "This application cannot be withdrawn.",
            );
          await ctx.emit(
            session,
            "notification",
            "PostApplicationStatusChanged.v1",
            updated._id,
            updated.revision,
            {
              userId: updated.recipientId,
              title: "Referral application withdrawn",
              body: `An applicant withdrew their application for ${updated.postTitle}.`,
              resourceType: "received_post_application",
              resourceId: String(updated._id),
            },
          );
          return dto(updated.toObject(), req.actor.userId);
        }),
      );
    }),
  );
}

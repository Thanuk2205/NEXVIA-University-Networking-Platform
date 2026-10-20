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
  paginate,
  page,
} from "@nexvia/platform-utils";
import { postSchema, acceptsApplications } from "./domain.js";
import { installPostApplications } from "./applications.js";
export async function install(ctx) {
  const { app, model, auth, rpc, config } = ctx;
  const Post = model("posts", {
    authorId: String,
    authorName: String,
    authorRole: String,
    body: String,
    tags: [String],
    opportunityId: String,
    postType: { type: String, default: "update" },
    job: {
      title: String,
      company: String,
      location: String,
      employmentType: String,
      deadline: Date,
    },
    jobStatus: String,
    submissionSerial: { type: Number, default: 0 },
    status: { type: String, default: "published" },
    revision: { type: Number, default: 1 },
  });
  const Report = model(
    "reports",
    {
      postId: String,
      reporterId: String,
      reason: String,
      status: { type: String, default: "open" },
    },
    [[{ postId: 1, reporterId: 1 }, { unique: true }]],
  );
  const Moderation = model("moderation_actions", {
    postId: String,
    actorId: String,
    action: String,
    reason: String,
  });
  Object.assign(ctx, { Post, Report, Moderation });
  const schema = postSchema;
  await installPostApplications(ctx);
  app.get(
    "/api/v1/posts",
    auth(),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      const type = validate(
        z.enum(["all", "job", "update"]).default("all"),
        req.query.type,
      );
      const rows = await Post.find({
        ...filter,
        status: "published",
        ...(type === "job"
          ? { postType: "job" }
          : type === "update"
            ? { postType: { $ne: "job" } }
            : {}),
      })
        .select("-submissionSerial")
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const result = page(rows, limit);
      const ownApplications = await ctx.PostApplication.find({
        applicantId: req.actor.userId,
        postId: { $in: result.items.map((p) => String(p._id)) },
      })
        .select("postId status")
        .lean();
      respond(res, {
        ...result,
        items: result.items.map((p) => ({
          ...p,
          acceptingApplications: acceptsApplications(p),
          myApplication:
            ownApplications.find((a) => a.postId === String(p._id)) || null,
        })),
      });
    }),
  );
  app.post(
    "/api/v1/posts",
    auth(),
    asyncRoute(async (req, res) => {
      const b = validate(schema, req.body);
      const author = await rpc(
        "profile",
        `/internal/author/${req.actor.userId}`,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [p] = await Post.create(
            [
              {
                ...b,
                authorId: req.actor.userId,
                authorName: author.fullName,
                authorRole: req.actor.role,
                ...(b.postType === "job" ? { jobStatus: "open" } : {}),
              },
            ],
            { session },
          );
          return p.toObject();
        }),
        201,
      );
    }),
  );
  app.patch(
    "/api/v1/posts/:id",
    auth(),
    asyncRoute(async (req, res) => {
      const b = validate(schema, req.body);
      const p = await Post.findOne({
        _id: validate(id, req.params.id),
        authorId: req.actor.userId,
        status: "published",
      }).lean();
      if (!p) fail(404, "NOT_FOUND", "Your post was not found.");
      if (b.postType !== (p.postType || "update"))
        fail(
          409,
          "POST_TYPE",
          "Create a new post to change between a job referral and an update.",
        );
      if (
        Number(String(req.headers["if-match"]).replaceAll('"', "")) !==
        p.revision
      )
        fail(412, "STALE_POST", "Reload the post before editing.");
      respond(
        res,
        await ctx.command(req, async (session) => {
          const updated = await Post.findOneAndUpdate(
            { _id: p._id, revision: p.revision },
            { $set: b, $inc: { revision: 1 } },
            { new: true, session },
          );
          if (!updated)
            fail(412, "STALE_POST", "Reload the post before editing.");
          return updated.toObject();
        }),
      );
    }),
  );
  app.delete(
    "/api/v1/posts/:id",
    auth(),
    asyncRoute(async (req, res) => {
      const p = await Post.findOneAndUpdate(
        { _id: validate(id, req.params.id), authorId: req.actor.userId },
        { $set: { status: "deleted" }, $inc: { revision: 1 } },
        { new: true },
      );
      if (!p) fail(404, "NOT_FOUND", "Your post was not found.");
      respond(res, { deleted: true });
    }),
  );
  app.post(
    "/api/v1/posts/:id/close",
    auth(),
    asyncRoute(async (req, res) => {
      const p = await Post.findOneAndUpdate(
        {
          _id: validate(id, req.params.id),
          authorId: req.actor.userId,
          postType: "job",
          jobStatus: "open",
          status: "published",
        },
        { $set: { jobStatus: "closed" }, $inc: { revision: 1 } },
        { new: true },
      );
      if (!p)
        fail(
          409,
          "POST_CLOSED",
          "Your job referral is already closed or unavailable.",
        );
      respond(res, p.toObject());
    }),
  );
  app.post(
    "/api/v1/posts/:id/reports",
    auth(),
    asyncRoute(async (req, res) => {
      const b = validate(
        z.object({ reason: text(1000, 3) }).strict(),
        req.body,
      );
      if (
        !(await Post.exists({
          _id: validate(id, req.params.id),
          status: "published",
        }))
      )
        fail(404, "NOT_FOUND", "Post not found.");
      respond(
        res,
        await ctx.command(req, async (session) => {
          const [r] = await Report.create(
            [
              {
                postId: req.params.id,
                reporterId: req.actor.userId,
                reason: b.reason,
              },
            ],
            { session },
          );
          return { reportId: String(r._id), status: "open" };
        }),
        201,
      );
    }),
  );
  app.get(
    "/api/v1/admin/reports",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Report.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/api/v1/admin/moderation-actions",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            postId: id,
            action: z.enum(["hide", "restore"]),
            reason: text(1000, 3),
          })
          .strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const p = await Post.findOneAndUpdate(
            { _id: b.postId, status: { $ne: "deleted" } },
            {
              $set: { status: b.action === "hide" ? "hidden" : "published" },
              $inc: { revision: 1 },
            },
            { new: true, session },
          );
          if (!p) fail(404, "NOT_FOUND", "Post not found.");
          await Moderation.create([{ ...b, actorId: req.actor.userId }], {
            session,
          });
          await Report.updateMany(
            { postId: b.postId },
            { $set: { status: "reviewed" } },
            { session },
          );
          await ctx.audit(
            session,
            req.actor,
            "community.moderate",
            p._id,
            b.reason,
          );
          return { postId: b.postId, status: p.status };
        }),
        201,
      );
    }),
  );
  ctx.handlers.identity = {
    "AccountDeletionRequested.v1": async (e, session) => {
      await ctx.PostOwnerState.updateOne(
        { ownerId: e.data.userId },
        {
          $set: { deletedAt: new Date() },
          $inc: { serial: 1 },
        },
        { upsert: true, session },
      );
      await Post.updateMany(
        { authorId: e.data.userId },
        { $set: { authorName: "Former university member", status: "hidden" } },
        { session },
      );
      await ctx.PostCvFile.deleteMany({ ownerId: e.data.userId }, { session });
      await ctx.PostApplication.updateMany(
        { applicantId: e.data.userId },
        {
          $set: {
            applicantName: "Former university member",
            cvAvailable: false,
          },
          $unset: { profileSnapshot: 1, contactEmail: 1, message: 1 },
        },
        { session },
      );
    },
  };
}

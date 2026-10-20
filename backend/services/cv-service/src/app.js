import { registerFonts, writeText } from "./pdf.js";
import PDFDocument from "pdfkit";
import {
  z,
  id,
  validate,
  fail,
  respond,
  asyncRoute,
  internal,
  userToken,
  paginate,
  page,
} from "@nexvia/platform-utils";
import { template, documentSchema, assist } from "./domain.js";
export async function install(ctx) {
  const { app, model, auth, config, rpc } = ctx;
  const Document = model(
    "cv_documents",
    {
      ownerId: String,
      generationJobId: String,
      content: Object,
      revision: { type: Number, default: 1 },
      reviewed: { type: Boolean, default: false },
      profileVersion: Number,
      mode: String,
    },
    [
      [
        { generationJobId: 1 },
        {
          unique: true,
          partialFilterExpression: { generationJobId: { $type: "string" } },
        },
      ],
    ],
  );
  const Revision = model(
    "cv_revisions",
    { documentId: String, ownerId: String, revision: Number, content: Object },
    [[{ documentId: 1, revision: 1 }, { unique: true }]],
  );
  const Job = model("generation_jobs", {
    ownerId: String,
    input: Object,
    profileVersion: Number,
    aiConsent: Boolean,
    consentAt: Date,
    consentPolicyVersion: String,
    status: { type: String, default: "queued" },
    documentId: String,
    mode: String,
    lastError: String,
    leaseUntil: Date,
  });
  Object.assign(ctx, { Document, Revision, Job });
  app.post(
    "/api/v1/cv/generations",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({ aiConsent: z.boolean(), includeContactEmail: z.boolean() })
          .strict(),
        req.body,
      );
      const p = await rpc("profile", "/internal/owner-snapshot", {
        actor: userToken(req),
      });
      if (!p.completion.cvExportReady)
        fail(
          409,
          "CV_PROFILE_INCOMPLETE",
          "Complete the CV requirements in your profile checklist.",
        );
      const labels = await rpc("profile", "/internal/academic-labels");
      const account = b.includeContactEmail
        ? await rpc("identity", `/internal/cv-contact/${req.actor.userId}`, {
            actor: userToken(req),
          })
        : null;
      const input = template(p, labels, account?.email);
      respond(
        res,
        await ctx.command(
          req,
          async (session) => {
            const [j] = await Job.create(
              [
                {
                  ownerId: req.actor.userId,
                  input,
                  profileVersion: p.profileVersion,
                  aiConsent: b.aiConsent,
                  consentAt: b.aiConsent ? new Date() : undefined,
                  consentPolicyVersion: b.aiConsent ? "2026-10-v1" : undefined,
                },
              ],
              { session },
            );
            return {
              jobId: String(j._id),
              status: "queued",
              statusUrl: `/api/v1/cv/generations/${j._id}`,
            };
          },
          true,
        ),
        202,
      );
    }),
  );
  app.get(
    "/api/v1/cv/generations/:id",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const j = await Job.findOne({
        _id: validate(id, req.params.id),
        ownerId: req.actor.userId,
      })
        .select("-input")
        .lean();
      if (!j) fail(404, "NOT_FOUND", "Generation job not found.");
      respond(res, j);
    }),
  );
  app.get(
    "/api/v1/cv/documents",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Document.find({ ...filter, ownerId: req.actor.userId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  const owned = async (req) => {
    const d = await Document.findOne({
      _id: validate(id, req.params.id),
      ownerId: req.actor.userId,
    }).lean();
    if (!d) fail(404, "NOT_FOUND", "CV document not found.");
    return d;
  };
  app.get(
    "/api/v1/cv/documents/:id",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => respond(res, await owned(req))),
  );
  app.get(
    "/api/v1/cv/documents/:id/revisions",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const d = await owned(req);
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Revision.find({
            ...filter,
            documentId: String(d._id),
            ownerId: req.actor.userId,
          })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.patch(
    "/api/v1/cv/documents/:id",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({ content: documentSchema, reviewed: z.literal(true) })
          .strict(),
        req.body,
      );
      const d = await owned(req);
      if (
        Number(String(req.headers["if-match"]).replaceAll('"', "")) !==
        d.revision
      )
        fail(412, "CV_STALE", "Reload the current CV before editing.");
      respond(
        res,
        await ctx.command(req, async (session) => {
          const v = await Document.findOneAndUpdate(
            { _id: d._id, ownerId: req.actor.userId, revision: d.revision },
            {
              $set: { content: b.content, reviewed: true },
              $inc: { revision: 1 },
            },
            { new: true, session },
          );
          if (!v) fail(412, "CV_STALE", "Reload the current CV.");
          await Revision.create(
            [
              {
                documentId: String(v._id),
                ownerId: v.ownerId,
                revision: v.revision,
                content: v.content,
              },
            ],
            { session },
          );
          return v.toObject();
        }),
      );
    }),
  );
  app.get(
    "/api/v1/cv/documents/:id/pdf",
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const d = await owned(req);
      if (!d.reviewed)
        fail(409, "CV_REVIEW", "Review and approve this CV before exporting.");
      const c = d.content;
      const pdf = new PDFDocument({
        margin: 48,
        size: "A4",
        info: { Title: `${c.fullName} - CV`, Author: c.fullName },
      });
      registerFonts(pdf);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Nexvia-CV.pdf"',
      });
      pdf.pipe(res);
      pdf.fontSize(22);
      writeText(pdf, c.fullName);
      pdf.fontSize(10);
      if (c.contactEmail) writeText(pdf, c.contactEmail);
      if (c.headline) writeText(pdf, c.headline);
      pdf.moveDown();
      const section = (title, entries) => {
        if (!entries.length) return;
        pdf.moveDown().fontSize(13);
        writeText(pdf, title);
        pdf.moveDown(0.3).fontSize(10);
        entries.forEach((e) => {
          writeText(pdf, e, { paragraphGap: 6 });
        });
      };
      if (c.summary) section("Profile", [c.summary]);
      section(
        "Education",
        c.education.map(
          (e) =>
            `${e.qualification} - ${e.institution} (${e.startYear} - ${e.endYear || "Present"})`,
        ),
      );
      section("Skills", c.skills.length ? [c.skills.join(", ")] : []);
      section(
        "Projects",
        c.projects.map((p) => `${p.title}\n${p.description}`),
      );
      section(
        "Experience",
        c.experience.map(
          (e) =>
            `${e.title} - ${e.organization}\n${e.startDate} - ${e.endDate || "Present"}\n${e.description || ""}`,
        ),
      );
      section(
        "Certifications",
        c.certifications.map((e) => `${e.name} - ${e.issuer}`),
      );
      section(
        "Achievements",
        c.achievements.map((e) => `${e.title}\n${e.description || ""}`),
      );
      pdf.end();
    }),
  );
  app.get(
    "/internal/documents/:id",
    internal(config, ["opportunity"]),
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      const d = await owned(req);
      if (!d.reviewed)
        fail(409, "CV_REVIEW", "Approve the CV before submitting it.");
      respond(res, {
        documentId: String(d._id),
        revision: d.revision,
        content: d.content,
      });
    }),
  );
  ctx.workers.push(async () => {
    const j = await Job.findOneAndUpdate(
      {
        status: { $in: ["queued", "running"] },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lt: new Date() } },
        ],
      },
      { $set: { status: "running", leaseUntil: new Date(Date.now() + 60000) } },
      { new: true },
    ).lean();
    if (!j) return;
    const account = await rpc("identity", `/internal/accounts/${j.ownerId}`);
    if (
      !account.isActive ||
      !account.emailVerified ||
      account.approvalStatus !== "approved"
    ) {
      await Job.updateOne({ _id: j._id }, { $set: { status: "cancelled" } });
      return;
    }
    let result = { document: j.input, mode: "template" };
    if (j.aiConsent) {
      try {
        result = await assist(j.input);
      } catch {
        result = {
          document: j.input,
          mode: "template-fallback",
          fallbackReason:
            "Gemini assistance was unavailable; factual profile content was retained.",
        };
      }
    }
    await ctx.transaction(async (session) => {
      if (
        !(await Job.exists({
          _id: j._id,
          status: "running",
          leaseUntil: j.leaseUntil,
        }).session(session))
      )
        return;
      const [d] = await Document.create(
        [
          {
            ownerId: j.ownerId,
            generationJobId: String(j._id),
            content: result.document,
            profileVersion: j.profileVersion,
            mode: result.mode,
          },
        ],
        { session },
      );
      await Revision.create(
        [
          {
            documentId: String(d._id),
            ownerId: j.ownerId,
            revision: 1,
            content: d.content,
          },
        ],
        { session },
      );
      await Job.updateOne(
        { _id: j._id },
        {
          $set: {
            status: "completed",
            documentId: String(d._id),
            mode: result.mode,
            lastError: result.fallbackReason,
          },
          $unset: { leaseUntil: 1 },
        },
        { session },
      );
      await ctx.emit(
        session,
        "notification",
        "CvGenerationCompleted.v1",
        d._id,
        1,
        {
          userId: j.ownerId,
          title: "Your CV draft is ready",
          body: "Review your factual CV draft before exporting.",
          resourceId: String(d._id),
        },
      );
    });
  });
  ctx.handlers.identity = {
    "AccountDeletionRequested.v1": async (e, session) => {
      await Job.updateMany(
        { ownerId: e.data.userId, status: "queued" },
        { $set: { status: "cancelled" } },
        { session },
      );
      await Document.deleteMany({ ownerId: e.data.userId }, { session });
      await Revision.deleteMany({ ownerId: e.data.userId }, { session });
    },
  };
}

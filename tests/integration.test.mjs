import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { stack, demoPassword } from "./harness.mjs";
import { decryptLink } from "../services/identity-service/src/app.js";
let s;
before(async () => {
  s = await stack();
});
after(async () => {
  if (s) await s.close();
});
async function browser(role) {
  const agent = request.agent(s.gateway);
  let csrf;
  const get = await agent.get("/api/v1/auth/csrf");
  csrf = get.body.data.csrfToken;
  function headers(req) {
    return req
      .set("Origin", "http://localhost:5173")
      .set("X-CSRF-Token", csrf)
      .set("Idempotency-Key", crypto.randomUUID());
  }
  async function send(method, path, body, extra = {}) {
    if (method === "patch" && path === "/profiles/me" && !extra["If-Match"])
      extra = {
        ...extra,
        "If-Match": String(
          (await agent.get("/api/v1/profiles/me")).body.data.profileVersion,
        ),
      };
    const response = await headers(agent[method](`/api/v1${path}`))
      .set(extra)
      .send(body);
    for (const cookie of response.headers["set-cookie"] || [])
      if (cookie.startsWith("nx_csrf="))
        csrf = decodeURIComponent(cookie.split(";")[0].slice(8));
    return response;
  }
  if (role) {
    const login = await send("post", "/auth/login", {
      email: `${role}@demo.example`,
      password: demoPassword,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }
  return { agent, send };
}
test("Private records, sessions, and internal routes are enforced", async () => {
  const b = await browser("student");
  assert.equal((await b.agent.get("/api/v1/profiles/me")).status, 200);
  assert.equal((await b.agent.get("/api/v1/admin/accounts")).status, 403);
  assert.equal((await b.agent.get("/api/v1/internal/accounts")).status, 404);
  assert.equal(
    (await request(s.urls.profile).get("/internal/owner-snapshot")).status,
    403,
  );
  assert.equal(
    (await b.agent.patch("/api/v1/profiles/me").send({ role: "admin" })).status,
    403,
  );
  const changed = await b.send("patch", "/profiles/me", { role: "admin" });
  assert.equal(changed.status, 400);
});
test("Registration requires email verification and independent institutional approval", async () => {
  const b = await browser();
  const res = await b.send("post", "/auth/register", {
    email: "new@demo.example",
    password: demoPassword,
    fullName: "New Student",
    role: "student",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.emailVerified, false);
  assert.equal((await b.agent.get("/api/v1/opportunities")).status, 403);
  await s.pump(2);
  const token = await s.services.identity.Token.findOne({
    userId: res.body.data.userId,
    kind: "verify",
  }).lean();
  assert.ok(token);
  const raw = decryptLink(token.payload, s.services.identity.config.tokenKey);
  assert.equal(
    (await b.send("post", "/auth/verify-email", { token: raw })).status,
    200,
  );
  assert.equal(
    (await b.send("post", "/auth/verify-email", { token: raw })).status,
    400,
  );
  assert.equal((await b.agent.get("/api/v1/opportunities")).status, 403);
  assert.equal(
    s.sent.some((message) => message.email === "new@demo.example"),
    true,
  );
});
test("Employer search excludes private data and immediately honors revocation", async () => {
  const e = await browser("employer");
  const results = await e.agent.get("/api/v1/candidates/search");
  assert.equal(results.status, 200, JSON.stringify(results.body));
  const candidate = results.body.data.items.find(
    (c) => c.userId === String(s.fixtures.users.student._id),
  );
  assert.ok(candidate);
  for (const key of [
    "email",
    "registrationNumber",
    "passwordHash",
    "education",
    "applications",
  ])
    assert.equal(candidate[key], undefined);
  const b = await browser("student");
  assert.equal(
    (
      await b.send("patch", "/profiles/me", {
        candidateDiscovery: { enabled: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (await e.agent.get(`/api/v1/candidates/${s.fixtures.users.student._id}`))
      .status,
    404,
  );
  const matches = await b.agent.get("/api/v1/recommendations/me");
  assert.equal(matches.status, 200, JSON.stringify(matches.body));
  await b.send("patch", "/profiles/me", {
    candidateDiscovery: { enabled: true },
  });
});
test("Duplicate applications are retry safe, private, and use employer-owned status transitions", async () => {
  const b = await browser("student");
  const key = crypto.randomUUID();
  const vacancy = s.fixtures.vacancy;
  const payload = { consent: true, opportunityRevision: vacancy.revision };
  const a = await b.send(
    "post",
    `/opportunities/${vacancy._id}/applications`,
    payload,
    { "Idempotency-Key": key },
  );
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const again = await b.send(
    "post",
    `/opportunities/${vacancy._id}/applications`,
    payload,
    { "Idempotency-Key": key },
  );
  assert.equal(again.body.data._id, a.body.data._id);
  assert.equal(
    await s.services.opportunity.Application.countDocuments({
      applicantId: String(s.fixtures.users.student._id),
    }),
    1,
  );
  const e = await browser("employer");
  assert.equal(
    (
      await e.send("patch", `/applications/${a.body.data._id}/status`, {
        status: "shortlisted",
        reason: "Demonstration review",
      })
    ).status,
    200,
  );
  assert.equal(
    (await b.agent.get(`/api/v1/opportunities/${vacancy._id}/applications`))
      .status,
    403,
  );
});
test("University opportunities reject internal applications and preserve external methods", async () => {
  const f = await browser("faculty");
  const invalid = await f.send("post", "/opportunities", {
    title: "University internship",
    description: "University placement information",
    kind: "internship",
    scope: { departmentId: s.fixtures.ids.departmentId },
    applicationMethod: "internal",
  });
  assert.equal(invalid.status, 400, JSON.stringify(invalid.body));
  const valid = await f.send("post", "/opportunities", {
    title: "University internship",
    description: "University placement information",
    kind: "internship",
    scope: { departmentId: s.fixtures.ids.departmentId },
    applicationMethod: "external",
    applicationUrl: "https://example.com/apply",
  });
  assert.equal(valid.status, 201, JSON.stringify(valid.body));
});
test("Notice scope, stale previews, dispatch deduplication, and recipient read ownership", async () => {
  const f = await browser("faculty");
  const n = await f.send("post", "/academic-notices", {
    title: "Academic demonstration notice",
    body: "Upcoming university guidance session.",
    category: "academic",
    scope: { departmentId: s.fixtures.ids.departmentId },
  });
  assert.equal(n.status, 201, JSON.stringify(n.body));
  assert.equal(
    (await f.send("post", `/academic-notices/${n.body.data._id}/publish`, {}))
      .status,
    200,
  );
  const preview = await f.send("post", "/dispatches/preview", {
    contentType: "academic_notice",
    contentId: n.body.data._id,
    criteria: {},
  });
  assert.equal(preview.status, 201, JSON.stringify(preview.body));
  assert.equal(preview.body.data.count, 1);
  const key = crypto.randomUUID();
  const d = await f.send(
    "post",
    "/dispatches",
    { previewId: preview.body.data.previewId },
    { "Idempotency-Key": key },
  );
  assert.equal(d.status, 202, JSON.stringify(d.body));
  const duplicate = await f.send(
    "post",
    "/dispatches",
    { previewId: preview.body.data.previewId },
    { "Idempotency-Key": key },
  );
  assert.equal(duplicate.body.data.dispatchId, d.body.data.dispatchId);
  const freshKeyRetry = await f.send("post", "/dispatches", {
    previewId: preview.body.data.previewId,
  });
  assert.equal(freshKeyRetry.body.data.dispatchId, d.body.data.dispatchId);
  assert.equal(
    await s.services.matching.Dispatch.countDocuments({
      previewId: preview.body.data.previewId,
    }),
    1,
  );
  await s.pump(3);
  const student = await browser("student");
  const inbox = await student.agent.get("/api/v1/notifications");
  assert.equal(inbox.status, 200);
  const record = inbox.body.data.items.find(
    (i) => i.dispatchId === d.body.data.dispatchId,
  );
  assert.ok(record);
  const employer = await browser("employer");
  assert.equal(
    (await employer.send("patch", `/notifications/${record._id}/read`, {}))
      .status,
    404,
  );
  assert.equal(
    (await student.send("patch", `/notifications/${record._id}/read`, {}))
      .status,
    200,
  );
  const outside = await f.send("post", "/dispatches/preview", {
    contentType: "academic_notice",
    contentId: n.body.data._id,
    criteria: { departmentId: "111111111111111111111111" },
  });
  assert.equal(outside.status, 403);
});
test("CV jobs preserve facts, require owner review, and enforce ownership", async () => {
  const b = await browser("student");
  const j = await b.send("post", "/cv/generations", {
    aiConsent: false,
    includeContactEmail: false,
  });
  assert.equal(j.status, 202, JSON.stringify(j.body));
  await s.pump(2);
  const job = await b.agent.get(`/api/v1/cv/generations/${j.body.data.jobId}`);
  assert.equal(job.body.data.status, "completed");
  const docId = job.body.data.documentId;
  const doc = await b.agent.get(`/api/v1/cv/documents/${docId}`);
  assert.equal(doc.body.data.content.registrationNumber, undefined);
  assert.equal(
    (await b.agent.get(`/api/v1/cv/documents/${docId}/pdf`)).status,
    409,
  );
  const a = await browser("alumni");
  assert.equal(
    (await a.agent.get(`/api/v1/cv/documents/${docId}`)).status,
    404,
  );
  assert.equal(
    (
      await b.send(
        "patch",
        `/cv/documents/${docId}`,
        { content: doc.body.data.content, reviewed: true },
        { "If-Match": String(doc.body.data.revision) },
      )
    ).status,
    200,
  );
  const pdf = await b.agent.get(`/api/v1/cv/documents/${docId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers["content-type"], /pdf/);
});
test("Graduation retains identity, profile, posts, CVs, and applications across retries", async () => {
  const b = await browser("student");
  const userId = String(s.fixtures.users.student._id);
  const post = await b.send("post", "/posts", {
    body: "My graduation journey",
    tags: [],
  });
  assert.equal(post.status, 201);
  const request = await b.send("post", "/profiles/me/graduation-requests", {
    degreeProgramId: s.fixtures.ids.degreeProgramId,
    batchId: s.fixtures.ids.batchId,
    claimedGraduationYear: 2026,
  });
  assert.equal(request.status, 201, JSON.stringify(request.body));
  const admin = await browser("admin");
  const f = await browser("faculty");
  assert.equal(
    (
      await f.send(
        "patch",
        `/admin/graduation-requests/${request.body.data._id}/decision`,
        {
          decision: "approved",
          graduationYear: 2026,
          evidenceReference: "DEMO-ROSTER",
          reason: "Confirmed institutional roster",
        },
      )
    ).status,
    403,
  );
  const decision = await admin.send(
    "patch",
    `/admin/graduation-requests/${request.body.data._id}/decision`,
    {
      decision: "approved",
      graduationYear: 2026,
      evidenceReference: "DEMO-ROSTER",
      reason: "Confirmed institutional roster",
    },
  );
  assert.equal(decision.status, 200, JSON.stringify(decision.body));
  await s.pump(3);
  assert.equal((await b.agent.get("/api/v1/profiles/me")).status, 401);
  const current = await browser("student");
  const me = await current.agent.get("/api/v1/auth/me");
  assert.equal(me.body.data.role, "alumni");
  assert.equal(me.body.data.userId, userId);
  assert.equal(
    await s.services.community.Post.countDocuments({
      _id: post.body.data._id,
      authorId: userId,
    }),
    1,
  );
  assert.equal(
    await s.services.opportunity.Application.countDocuments({
      applicantId: userId,
    }),
    1,
  );
  assert.ok(await s.services.cv.Document.countDocuments({ ownerId: userId }));
  assert.equal(
    (await s.services.profile.Graduation.findById(request.body.data._id))
      .status,
    "completed",
  );
});

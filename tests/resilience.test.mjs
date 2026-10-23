import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { stack, demoPassword } from "./harness.mjs";
import { verifyUser, client } from "@nexvia/platform-utils";
let s;
before(async () => {
  s = await stack();
});
after(async () => {
  if (s) await s.close();
});
async function browser(role) {
  const agent = request.agent(s.gateway);
  let csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken,
    cookies = [];
  async function send(method, path, body, headers = {}) {
    const response = await agent[method](`/api/v1${path}`)
      .set("Origin", "http://localhost:5173")
      .set("X-CSRF-Token", csrf)
      .set("Idempotency-Key", crypto.randomUUID())
      .set(headers)
      .send(body);
    for (const value of response.headers["set-cookie"] || []) {
      const cookie = value.split(";")[0];
      cookies = cookies.filter(
        (item) => !item.startsWith(cookie.split("=")[0] + "="),
      );
      cookies.push(cookie);
      if (cookie.startsWith("nx_csrf="))
        csrf = decodeURIComponent(cookie.slice(8));
    }
    return response;
  }
  const response = await send("post", "/auth/login", {
    email: `${role}@demo.example`,
    password: demoPassword,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return {
    agent,
    send,
    get csrf() {
      return csrf;
    },
    get cookies() {
      return cookies.join("; ");
    },
  };
}
test("Stale profile forms cannot overwrite another session", async () => {
  const b = await browser("student"),
    old = (await b.agent.get("/api/v1/profiles/me")).body.data;
  assert.equal(
    (
      await b.send(
        "patch",
        "/profiles/me",
        { headline: "Saved in the first session" },
        { "If-Match": String(old.profileVersion) },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await b.send(
        "patch",
        "/profiles/me",
        { headline: "Stale form" },
        { "If-Match": String(old.profileVersion) },
      )
    ).status,
    412,
  );
  assert.equal(
    (await b.agent.get("/api/v1/profiles/me")).body.data.headline,
    "Saved in the first session",
  );
});
test("Refresh-token replay revokes access immediately", async () => {
  const b = await browser("student"),
    oldCookies = b.cookies,
    oldCsrf = b.csrf;
  assert.equal((await b.send("post", "/auth/refresh", {})).status, 200);
  const replay = await request(s.gateway)
    .post("/api/v1/auth/refresh")
    .set("Cookie", oldCookies)
    .set("Origin", "http://localhost:5173")
    .set("X-CSRF-Token", oldCsrf)
    .send({});
  assert.equal(replay.status, 401);
  assert.equal((await b.agent.get("/api/v1/profiles/me")).status, 401);
});
test("Verification keys support overlap and reject unknown IDs", async () => {
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const config = {
    userPublicKeys: {
      "identity-1": s.keys.user.publicKey,
      "identity-2": pair.publicKey,
    },
  };
  const sign = (key, kid) =>
    jwt.sign({}, key, {
      algorithm: "RS256",
      keyid: kid,
      issuer: "nexvia-identity",
      audience: "nexvia-api",
      subject: "test",
      expiresIn: 60,
    });
  assert.equal(
    verifyUser(config, sign(s.keys.user.privateKey, "identity-1")).sub,
    "test",
  );
  assert.equal(
    verifyUser(config, sign(pair.privateKey, "identity-2")).sub,
    "test",
  );
  assert.throws(
    () => verifyUser(config, sign(pair.privateKey, "unregistered")),
    /Sign in/,
  );
  const jwks = await request(s.gateway).get("/api/v1/auth/jwks");
  assert.equal(jwks.body.data.keys[0].kty, "RSA");
  assert.equal(jwks.body.data.keys[0].d, undefined);
});
test("Legacy bcrypt passwords remain valid and are rehashed after login", async () => {
  const hash = await bcrypt.hash("legacy12", 10),
    a = await s.services.identity.Account.create({
      email: "legacy@demo.example",
      passwordHash: hash,
      role: "student",
      emailVerified: false,
      approvalStatus: "pending",
    });
  const agent = request.agent(s.gateway),
    csrf = (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken;
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", "http://localhost:5173")
    .set("X-CSRF-Token", csrf)
    .send({ email: a.email, password: "legacy12" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.match(
    (await s.services.identity.Account.findById(a._id)).passwordHash,
    /^scrypt:/,
  );
});
test("Suspended organizations cannot search, publish, or receive applications", async () => {
  const admin = await browser("admin"),
    e = await browser("employer"),
    student = await browser("student"),
    org = s.fixtures.organization;
  const route = `/admin/organizations/${org._id}/approval`,
    body = {
      status: "suspended",
      reason: "Synthetic suspension review",
      evidenceReference: "DEMO-REVIEW",
    };
  assert.equal((await admin.send("patch", route, body)).status, 200);
  assert.equal((await e.agent.get("/api/v1/candidates/search")).status, 403);
  assert.equal(
    (
      await student.send(
        "post",
        `/opportunities/${s.fixtures.vacancy._id}/applications`,
        { consent: true, opportunityRevision: 1 },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await e.send("post", "/opportunities", {
        title: "Suspended company job",
        description: "Demonstration",
        kind: "job",
        applicationMethod: "internal",
        scope: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (await admin.send("patch", route, { ...body, status: "approved" })).status,
    200,
  );
});
async function notice(f, title) {
  const body = {
    title,
    body: "Synthetic university guidance",
    category: "academic",
    scope: {},
  };
  const n = await f.send("post", "/academic-notices", body);
  assert.equal(n.status, 201, JSON.stringify(n.body));
  const pub = await f.send(
    "post",
    `/academic-notices/${n.body.data._id}/publish`,
    {},
  );
  assert.equal(pub.status, 200);
  return pub.body.data;
}
test("Changed or archived content invalidates dispatch previews and cancellation preserves history", async () => {
  const f = await browser("faculty"),
    n = await notice(f, "Stale preview test notice");
  const preview = await f.send("post", "/dispatches/preview", {
    contentType: "academic_notice",
    contentId: n._id,
    criteria: {},
  });
  assert.equal(preview.status, 201);
  const edit = await f.send(
    "patch",
    `/academic-notices/${n._id}`,
    {
      title: n.title,
      body: "Updated guidance",
      category: n.category,
      scope: n.scope,
    },
    { "If-Match": String(n.revision) },
  );
  assert.equal(edit.status, 200);
  assert.equal(
    (
      await f.send("post", "/dispatches", {
        previewId: preview.body.data.previewId,
      })
    ).body.error.code,
    "PREVIEW_STALE",
  );
  const next = await f.send("post", "/dispatches/preview", {
      contentType: "academic_notice",
      contentId: n._id,
      criteria: {},
    }),
    d = await f.send("post", "/dispatches", {
      previewId: next.body.data.previewId,
    });
  assert.equal(d.status, 202);
  assert.equal(
    (await f.send("post", `/dispatches/${d.body.data.dispatchId}/cancel`, {}))
      .status,
    200,
  );
  await s.pump(2);
  assert.equal(
    await s.services.notification.Notification.countDocuments({
      dispatchId: d.body.data.dispatchId,
    }),
    0,
  );
  assert.equal(
    (await f.agent.get("/api/v1/dispatches")).body.data.items[0].status,
    "cancelled",
  );
  const again = await f.send("post", "/dispatches/preview", {
    contentType: "academic_notice",
    contentId: n._id,
    criteria: {},
  });
  await f.send("post", `/academic-notices/${n._id}/archive`, {});
  assert.equal(
    (
      await f.send("post", "/dispatches", {
        previewId: again.body.data.previewId,
      })
    ).status,
    409,
  );
});
test("Notice pagination and controlled taxonomy reject invalid references", async () => {
  const f = await browser("faculty");
  for (let i = 0; i < 5; i++) await notice(f, `Pagination guidance ${i}`);
  const first = await f.agent.get("/api/v1/academic-notices?limit=2"),
    second = await f.agent.get(
      `/api/v1/academic-notices?limit=2&cursor=${encodeURIComponent(first.body.data.nextCursor)}`,
    );
  assert.equal(first.body.data.items.length, 2);
  assert.equal(second.body.data.items.length, 2);
  assert.equal(
    first.body.data.items.some((a) =>
      second.body.data.items.some((b) => a._id === b._id),
    ),
    false,
  );
  const admin = await browser("admin");
  assert.equal(
    (
      await admin.send("post", "/academic-notices", {
        title: "Invalid academic reference",
        body: "Demo",
        category: "academic",
        scope: { degreeProgramId: "111111111111111111111111" },
      })
    ).status,
    400,
  );
});
test("Duplicate events and abandoned leases do not duplicate recipient records", async () => {
  const f = await browser("faculty"),
    n = await notice(f, "Durable dispatch event test"),
    p = await f.send("post", "/dispatches/preview", {
      contentType: "academic_notice",
      contentId: n._id,
      criteria: {},
    }),
    d = await f.send("post", "/dispatches", {
      previewId: p.body.data.previewId,
    });
  await s.pump(3);
  const event = await s.services.matching.Outbox.findOne({
    "data.dispatchId": d.body.data.dispatchId,
  }).lean();
  assert.ok(event);
  await s.services.matching.Outbox.updateOne(
    { _id: event._id },
    {
      $set: {
        status: "running",
        leaseUntil: new Date(0),
        nextAttemptAt: new Date(0),
      },
    },
  );
  await s.pump(2);
  assert.equal(
    await s.services.notification.Notification.countDocuments({
      dispatchId: d.body.data.dispatchId,
    }),
    1,
  );
  assert.equal(
    await s.services.notification.Job.countDocuments({
      dispatchId: d.body.data.dispatchId,
    }),
    1,
  );
});
test("Interrupted Gmail sends stay unknown until an audited evidence-based decision", async () => {
  const job = await s.services.notification.Job.create({
    eventId: crypto.randomUUID(),
    recipientId: String(s.fixtures.users.student._id),
    kind: "application",
    status: "running",
    leaseUntil: new Date(0),
    title: "Synthetic email",
    body: "Demo",
  });
  await s.services.notification.tick();
  assert.equal(
    (await s.services.notification.Job.findById(job._id)).status,
    "unknown",
  );
  const admin = await browser("admin"),
    student = await browser("student"),
    path = `/admin/delivery-jobs/${job._id}/reconcile`,
    body = {
      decision: "confirmed_not_sent",
      reason: "Confirmed provider did not accept",
      evidenceReference: "DEMO-PROVIDER-CHECK",
    };
  assert.equal((await student.send("post", path, body)).status, 403);
  assert.equal(
    (await admin.send("post", path, { ...body, evidenceReference: "" })).status,
    400,
  );
  assert.equal((await admin.send("post", path, body)).status, 200);
  await s.services.notification.tick();
  assert.equal(
    (await s.services.notification.Job.findById(job._id)).status,
    "provider_accepted",
  );
});
test("Delayed events cannot recreate deleted inbox records", async () => {
  const userId = String(s.fixtures.users.alumni._id);
  await s.services.identity.Account.updateOne(
    { _id: userId },
    { $set: { isActive: false, deletionRequestedAt: new Date() } },
  );
  const sender = client(s.services.cv.config);
  await sender("notification", "/internal/events", {
    method: "POST",
    body: {
      eventId: crypto.randomUUID(),
      source: "cv",
      type: "CvGenerationCompleted.v1",
      data: { userId, title: "Late event", body: "Demo" },
    },
  });
  assert.equal(
    await s.services.notification.Notification.countDocuments({
      recipientId: userId,
    }),
    0,
  );
});
test("CV exports include Sinhala and Tamil fonts and paginate long reviewed content", async () => {
  const b = await browser("student"),
    job = await b.send("post", "/cv/generations", {
      aiConsent: false,
      includeContactEmail: false,
    });
  await s.pump(2);
  const status = (
      await b.agent.get(`/api/v1/cv/generations/${job.body.data.jobId}`)
    ).body.data,
    doc = (await b.agent.get(`/api/v1/cv/documents/${status.documentId}`)).body
      .data;
  const content = {
    ...doc.content,
    fullName: "තිසුරි மாணவர் Student",
    projects: Array.from({ length: 12 }, (_, i) => ({
      title: `Project ${i}`,
      description:
        "A factual project description with verified details. ".repeat(35),
    })),
  };
  assert.equal(
    (
      await b.send(
        "patch",
        `/cv/documents/${doc._id}`,
        { content, reviewed: true },
        { "If-Match": String(doc.revision) },
      )
    ).status,
    200,
  );
  const pdf = await b.agent
    .get(`/api/v1/cv/documents/${doc._id}/pdf`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
  assert.equal(pdf.status, 200);
  const bytes = pdf.body.toString("latin1");
  assert.match(bytes, /NotoSansSinhala/);
  assert.match(bytes, /NotoSansTamil/);
  assert.ok((bytes.match(/\/Type \/Page\b/g) || []).length > 1);
});
